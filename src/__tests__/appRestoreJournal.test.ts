import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_RESTORE_CREDENTIAL_AREAS,
  APP_RESTORE_CREDENTIAL_NOTICE_KEY,
  APP_RESTORE_HYDRATION_TARGETS,
  APP_RESTORE_JOURNAL_KEY,
  APP_RESTORE_SNAPSHOT_KEY,
  APP_RESTORE_WRITE_LOCK_KEY,
  clearAppRestoreCredentialNotice,
  ensureInterruptedAppRestoreRecovery,
  prepareAppRestoreHydration,
  readAppRestoreCredentialNotice,
  reportAppRestoreHydration,
  runWithAppDataWriteLock,
  runWithAppDataSnapshotLock,
  runWithExclusiveAppDataLock,
  writeAppRestoreCredentialNotice,
  type AppRestoreSnapshot,
} from "../lib/data/appRestoreJournal";
import { enqueueSessionMessageWrite } from "../store/sessionMessagePersistence";

function createSerialWebLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    request: vi.fn((...args: unknown[]) => {
      const callback = args[args.length - 1] as () => unknown;
      const current = tail.then(callback);
      tail = current.then(
        () => undefined,
        () => undefined,
      );
      return current;
    }),
  };
}

function createLocalStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    values,
  };
}

function createDb(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: unknown) => {
      values.set(key, value);
      return value;
    }),
    removeItem: vi.fn(async (key: string) => {
      values.delete(key);
    }),
    values,
  };
}

const transactionId = "restore1";

function createSnapshot(): AppRestoreSnapshot {
  return {
    version: 1,
    transactionId,
    managedDbKeys: ["settings", "session_messages_new"],
    dbEntries: [{ key: "settings", exists: true, value: "old-settings" }],
    localStorageEntries: [{ key: "core", exists: true, value: "old-core" }],
    stagedOpfsUrls: ["opfs://chat/restored/new.txt"],
    previousOpfsUrls: ["opfs://chat/old.txt"],
  };
}

describe("interrupted app restore recovery", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("persists, validates, and clears the post-restore credential checklist", () => {
    const localStorage = createLocalStorage();
    const restoredAt = "2026-07-16T08:00:00.000Z";

    writeAppRestoreCredentialNotice(localStorage, restoredAt);

    expect(readAppRestoreCredentialNotice(localStorage)).toEqual({
      version: 1,
      restoredAt,
      areas: APP_RESTORE_CREDENTIAL_AREAS,
    });
    expect(localStorage.values.has(APP_RESTORE_CREDENTIAL_NOTICE_KEY)).toBe(
      true,
    );

    clearAppRestoreCredentialNotice(localStorage);
    expect(readAppRestoreCredentialNotice(localStorage)).toBeNull();
  });

  it("keeps the no-journal path free of IndexedDB work", () => {
    const db = createDb();
    const localStorage = createLocalStorage();

    expect(
      ensureInterruptedAppRestoreRecovery({
        db,
        localStorageRef: localStorage,
        deleteOpfsUrl: vi.fn(async () => undefined),
      }),
    ).toBeUndefined();
    expect(db.getItem).not.toHaveBeenCalled();
  });

  it("waits for accepted writes before starting a fallback exclusive transaction", async () => {
    const events: string[] = [];
    let releaseWrite: (() => void) | undefined;
    const write = runWithAppDataWriteLock(async () => {
      events.push("write-start");
      await new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      events.push("write-end");
    });
    await Promise.resolve();

    const exclusive = runWithExclusiveAppDataLock(async () => {
      events.push("exclusive");
    });
    await Promise.resolve();
    expect(events).toEqual(["write-start"]);

    releaseWrite?.();
    await Promise.all([write, exclusive]);
    expect(events).toEqual(["write-start", "write-end", "exclusive"]);
  });

  it("keeps queued writes for one session inside the shared lock", async () => {
    vi.stubGlobal("navigator", { locks: createSerialWebLocks() });
    const events: string[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWrite = enqueueSessionMessageWrite("session1", async () => {
      events.push("first-start");
      await new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      });
      events.push("first-end");
    });
    await Promise.resolve();

    const secondWrite = enqueueSessionMessageWrite("session1", async () => {
      events.push("second");
    });
    await Promise.resolve();

    const exclusive = runWithExclusiveAppDataLock(async () => {
      events.push("exclusive");
    });
    await Promise.resolve();
    expect(events).toEqual(["first-start"]);

    releaseFirstWrite?.();
    await Promise.all([firstWrite, secondWrite, exclusive]);
    expect(events).toEqual(["first-start", "first-end", "second", "exclusive"]);
  });

  it("rejects writes admitted after an exclusive transaction is requested", async () => {
    vi.stubGlobal("navigator", { locks: createSerialWebLocks() });
    const events: string[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWrite = enqueueSessionMessageWrite("session1", async () => {
      events.push("first-start");
      await new Promise<void>((resolve) => {
        releaseFirstWrite = resolve;
      });
      events.push("first-end");
    });
    await Promise.resolve();

    const exclusive = runWithExclusiveAppDataLock(async () => {
      events.push("exclusive");
    });
    await expect(
      enqueueSessionMessageWrite("session1", async () => {
        events.push("late-write");
      }),
    ).rejects.toThrow("writes are paused");

    releaseFirstWrite?.();
    await Promise.all([firstWrite, exclusive]);
    expect(events).toEqual(["first-start", "first-end", "exclusive"]);
  });

  it("queues fallback writes behind a read-only snapshot", async () => {
    const events: string[] = [];
    let releaseSnapshot: (() => void) | undefined;
    const snapshot = runWithAppDataSnapshotLock(async () => {
      events.push("snapshot-start");
      await new Promise<void>((resolve) => {
        releaseSnapshot = resolve;
      });
      events.push("snapshot-end");
    });
    await Promise.resolve();

    const write = runWithAppDataWriteLock(async () => {
      events.push("write");
    });
    await Promise.resolve();
    expect(events).toEqual(["snapshot-start"]);

    releaseSnapshot?.();
    await Promise.all([snapshot, write]);
    expect(events).toEqual(["snapshot-start", "snapshot-end", "write"]);
  });

  it("queues a fallback restore transaction behind a read-only snapshot", async () => {
    const events: string[] = [];
    let releaseSnapshot: (() => void) | undefined;
    const snapshot = runWithAppDataSnapshotLock(async () => {
      events.push("snapshot-start");
      await new Promise<void>((resolve) => {
        releaseSnapshot = resolve;
      });
      events.push("snapshot-end");
    });
    await Promise.resolve();

    const restore = runWithExclusiveAppDataLock(async () => {
      events.push("restore");
    });
    await Promise.resolve();
    expect(events).toEqual(["snapshot-start"]);

    releaseSnapshot?.();
    await Promise.all([snapshot, restore]);
    expect(events).toEqual(["snapshot-start", "snapshot-end", "restore"]);
  });

  it("preserves Web Lock order for a snapshot admitted before an exclusive transaction", async () => {
    vi.stubGlobal("navigator", { locks: createSerialWebLocks() });
    const events: string[] = [];

    const snapshot = runWithAppDataSnapshotLock(async () => {
      events.push("snapshot");
    });
    const exclusive = runWithExclusiveAppDataLock(async () => {
      events.push("exclusive");
    });

    await Promise.all([snapshot, exclusive]);
    expect(events).toEqual(["snapshot", "exclusive"]);
  });

  it("preserves fallback order for a snapshot admitted before an exclusive transaction", async () => {
    const events: string[] = [];

    const snapshot = runWithAppDataSnapshotLock(async () => {
      events.push("snapshot");
    });
    const exclusive = runWithExclusiveAppDataLock(async () => {
      events.push("exclusive");
    });

    await Promise.all([snapshot, exclusive]);
    expect(events).toEqual(["snapshot", "exclusive"]);
  });

  it("drains every fallback snapshot admitted before an exclusive transaction", async () => {
    const events: string[] = [];
    let releaseFirstSnapshot: (() => void) | undefined;
    let releaseSecondSnapshot: (() => void) | undefined;
    let markSecondSnapshotStarted: (() => void) | undefined;
    const secondSnapshotStarted = new Promise<void>((resolve) => {
      markSecondSnapshotStarted = resolve;
    });

    const firstSnapshot = runWithAppDataSnapshotLock(async () => {
      events.push("first-start");
      await new Promise<void>((resolve) => {
        releaseFirstSnapshot = resolve;
      });
      events.push("first-end");
    });
    await Promise.resolve();

    const secondSnapshot = runWithAppDataSnapshotLock(async () => {
      events.push("second-start");
      markSecondSnapshotStarted?.();
      await new Promise<void>((resolve) => {
        releaseSecondSnapshot = resolve;
      });
      events.push("second-end");
    });
    const exclusive = runWithExclusiveAppDataLock(async () => {
      events.push("exclusive");
    });

    releaseFirstSnapshot?.();
    await secondSnapshotStarted;
    await Promise.resolve();
    expect(events).toEqual(["first-start", "first-end", "second-start"]);

    releaseSecondSnapshot?.();
    await Promise.all([firstSnapshot, secondSnapshot, exclusive]);
    expect(events).toEqual([
      "first-start",
      "first-end",
      "second-start",
      "second-end",
      "exclusive",
    ]);
  });

  it("fails closed and preserves an invalid journal", async () => {
    const db = createDb();
    const localStorage = createLocalStorage({
      [APP_RESTORE_JOURNAL_KEY]: "not-json",
    });

    await expect(
      ensureInterruptedAppRestoreRecovery({
        db,
        localStorageRef: localStorage,
        deleteOpfsUrl: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("journal is invalid");
    expect(localStorage.values.get(APP_RESTORE_JOURNAL_KEY)).toBe("not-json");
  });

  it("clears a pre-transaction write gate and orphan snapshot", async () => {
    const db = createDb({ [APP_RESTORE_SNAPSHOT_KEY]: createSnapshot() });
    const localStorage = createLocalStorage({
      [APP_RESTORE_WRITE_LOCK_KEY]: transactionId,
    });

    await ensureInterruptedAppRestoreRecovery({
      db,
      localStorageRef: localStorage,
      deleteOpfsUrl: vi.fn(async () => undefined),
    });
    expect(localStorage.values.has(APP_RESTORE_WRITE_LOCK_KEY)).toBe(false);
    expect(db.values.has(APP_RESTORE_SNAPSHOT_KEY)).toBe(false);
  });

  it("fails closed when the rollback snapshot is missing", async () => {
    const db = createDb();
    const localStorage = createLocalStorage({
      [APP_RESTORE_JOURNAL_KEY]: JSON.stringify({
        version: 1,
        transactionId,
        phase: "applying",
      }),
    });

    await expect(
      ensureInterruptedAppRestoreRecovery({
        db,
        localStorageRef: localStorage,
        deleteOpfsUrl: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("rollback snapshot is missing or invalid");
    expect(localStorage.values.has(APP_RESTORE_JOURNAL_KEY)).toBe(true);
  });

  it.each(["staging", "applying"] as const)(
    "rolls back an interrupted %s transaction",
    async (phase) => {
      const snapshot = createSnapshot();
      const db = createDb({
        settings: "new-settings",
        session_messages_new: { nodesById: {} },
        [APP_RESTORE_SNAPSHOT_KEY]: snapshot,
      });
      const localStorage = createLocalStorage({
        core: "new-core",
        [APP_RESTORE_JOURNAL_KEY]: JSON.stringify({
          version: 1,
          transactionId,
          phase,
        }),
      });
      const deleteOpfsUrl = vi.fn(async () => undefined);

      await ensureInterruptedAppRestoreRecovery({
        db,
        localStorageRef: localStorage,
        deleteOpfsUrl,
      });

      expect(db.values.get("settings")).toBe("old-settings");
      expect(db.values.has("session_messages_new")).toBe(false);
      expect(localStorage.values.get("core")).toBe("old-core");
      expect(localStorage.values.has(APP_RESTORE_JOURNAL_KEY)).toBe(false);
      expect(db.values.has(APP_RESTORE_SNAPSHOT_KEY)).toBe(false);
      expect(deleteOpfsUrl).toHaveBeenCalledWith(
        "opfs://chat/restored/new.txt",
      );
    },
  );

  it("commits applied data only after every hydration target succeeds", async () => {
    const snapshot = createSnapshot();
    const db = createDb({
      settings: "new-settings",
      [APP_RESTORE_SNAPSHOT_KEY]: snapshot,
    });
    const localStorage = createLocalStorage({
      core: "new-core",
      [APP_RESTORE_JOURNAL_KEY]: JSON.stringify({
        version: 1,
        transactionId,
        phase: "applied_pending_boot",
      }),
      [APP_RESTORE_WRITE_LOCK_KEY]: transactionId,
    });
    const deleteOpfsUrl = vi.fn(async () => undefined);
    const validateRestoredData = vi.fn(async () => undefined);

    await prepareAppRestoreHydration({
      db,
      localStorageRef: localStorage,
      deleteOpfsUrl,
      validateRestoredData,
    });

    expect(
      JSON.parse(localStorage.values.get(APP_RESTORE_JOURNAL_KEY) || "null")
        ?.phase,
    ).toBe("booting");
    expect(db.values.has(APP_RESTORE_SNAPSHOT_KEY)).toBe(true);
    expect(deleteOpfsUrl).not.toHaveBeenCalled();

    let completed = false;
    const confirmations = APP_RESTORE_HYDRATION_TARGETS.slice(0, -1).map(
      (target) => reportAppRestoreHydration(target),
    );
    void Promise.all(confirmations).then(() => {
      completed = true;
    });
    await Promise.resolve();
    expect(completed).toBe(false);

    confirmations.push(
      reportAppRestoreHydration(
        APP_RESTORE_HYDRATION_TARGETS[APP_RESTORE_HYDRATION_TARGETS.length - 1],
      ),
    );
    await Promise.all(confirmations);

    expect(validateRestoredData).toHaveBeenCalledWith(snapshot);
    expect(db.values.get("settings")).toBe("new-settings");
    expect(localStorage.values.get("core")).toBe("new-core");
    expect(deleteOpfsUrl).toHaveBeenCalledWith("opfs://chat/old.txt");
    expect(deleteOpfsUrl).not.toHaveBeenCalledWith(
      "opfs://chat/restored/new.txt",
    );
    expect(db.values.has(APP_RESTORE_SNAPSHOT_KEY)).toBe(false);
    expect(localStorage.values.has(APP_RESTORE_JOURNAL_KEY)).toBe(false);
    expect(localStorage.values.has(APP_RESTORE_WRITE_LOCK_KEY)).toBe(false);
  });

  it("rolls back a boot that was interrupted before hydration completed", async () => {
    const snapshot = createSnapshot();
    const db = createDb({
      settings: "new-settings",
      [APP_RESTORE_SNAPSHOT_KEY]: snapshot,
    });
    const localStorage = createLocalStorage({
      core: "new-core",
      [APP_RESTORE_JOURNAL_KEY]: JSON.stringify({
        version: 1,
        transactionId,
        phase: "booting",
      }),
      [APP_RESTORE_WRITE_LOCK_KEY]: transactionId,
    });
    const deleteOpfsUrl = vi.fn(async () => undefined);

    await prepareAppRestoreHydration({
      db,
      localStorageRef: localStorage,
      deleteOpfsUrl,
    });

    expect(db.values.get("settings")).toBe("old-settings");
    expect(localStorage.values.get("core")).toBe("old-core");
    expect(deleteOpfsUrl).toHaveBeenCalledWith("opfs://chat/restored/new.txt");
    expect(localStorage.values.has(APP_RESTORE_JOURNAL_KEY)).toBe(false);
  });

  it("treats the early v3 committed phase as pending boot validation", async () => {
    const snapshot = createSnapshot();
    const db = createDb({
      settings: "new-settings",
      [APP_RESTORE_SNAPSHOT_KEY]: snapshot,
    });
    const localStorage = createLocalStorage({
      core: "new-core",
      [APP_RESTORE_JOURNAL_KEY]: JSON.stringify({
        version: 1,
        transactionId,
        phase: "committed",
      }),
      [APP_RESTORE_WRITE_LOCK_KEY]: transactionId,
    });

    await prepareAppRestoreHydration({
      db,
      localStorageRef: localStorage,
      deleteOpfsUrl: vi.fn(async () => undefined),
    });

    expect(
      JSON.parse(localStorage.values.get(APP_RESTORE_JOURNAL_KEY) || "null")
        ?.phase,
    ).toBe("booting");
    await Promise.all(
      APP_RESTORE_HYDRATION_TARGETS.map((target) =>
        reportAppRestoreHydration(target),
      ),
    );
  });

  it("rolls restored data back when hydration validation fails", async () => {
    const snapshot = createSnapshot();
    const db = createDb({
      settings: "new-settings",
      session_messages_new: { nodesById: {}, rootMessageIds: [] },
      [APP_RESTORE_SNAPSHOT_KEY]: snapshot,
    });
    const localStorage = createLocalStorage({
      core: "new-core",
      [APP_RESTORE_JOURNAL_KEY]: JSON.stringify({
        version: 1,
        transactionId,
        phase: "applied_pending_boot",
      }),
      [APP_RESTORE_WRITE_LOCK_KEY]: transactionId,
    });
    const deleteOpfsUrl = vi.fn(async () => undefined);

    await prepareAppRestoreHydration({
      db,
      localStorageRef: localStorage,
      deleteOpfsUrl,
    });
    await expect(
      reportAppRestoreHydration(
        "chat",
        new Error("simulated hydration failure"),
      ),
    ).rejects.toThrow("simulated hydration failure");

    expect(db.values.get("settings")).toBe("old-settings");
    expect(db.values.has("session_messages_new")).toBe(false);
    expect(localStorage.values.get("core")).toBe("old-core");
    expect(deleteOpfsUrl).toHaveBeenCalledWith("opfs://chat/restored/new.txt");
    expect(deleteOpfsUrl).not.toHaveBeenCalledWith("opfs://chat/old.txt");
    expect(db.values.has(APP_RESTORE_SNAPSHOT_KEY)).toBe(false);
    expect(localStorage.values.has(APP_RESTORE_JOURNAL_KEY)).toBe(false);
    expect(localStorage.values.has(APP_RESTORE_WRITE_LOCK_KEY)).toBe(false);
  });
});
