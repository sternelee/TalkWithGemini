import { beforeEach, describe, expect, it, vi } from "vitest";

function createLocalStorage(initial: Record<string, string>) {
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
  };
}

describe("restore bootstrap failures", () => {
  beforeEach(() => vi.resetModules());

  it.each([
    {
      name: "invalid journal",
      journal: "not-json",
      includeGate: false,
      expected: "journal is invalid",
    },
    {
      name: "missing rollback snapshot",
      journal: JSON.stringify({
        version: 1,
        transactionId: "restore-bootstrap",
        phase: "applied_pending_boot",
      }),
      includeGate: true,
      expected: "rollback snapshot is missing or invalid",
    },
  ])(
    "fails closed for an $name",
    async ({ journal, includeGate, expected }) => {
      const restore = await import("../lib/data/appRestoreJournal");
      const localStorage = createLocalStorage({
        [restore.APP_RESTORE_JOURNAL_KEY]: journal,
        ...(includeGate
          ? { [restore.APP_RESTORE_WRITE_LOCK_KEY]: "restore-bootstrap" }
          : {}),
      });
      const db = createDb();

      await expect(
        restore.prepareAppRestoreHydration({
          db,
          localStorageRef: localStorage,
          deleteOpfsUrl: vi.fn(async () => undefined),
        }),
      ).rejects.toThrow(expected);
      await expect(
        restore.reportAppRestoreHydration("settings"),
      ).rejects.toThrow(expected);

      const write = vi.fn(async () => undefined);
      await expect(restore.runWithAppDataWriteLock(write)).rejects.toThrow(
        "writes are paused",
      );
      expect(write).not.toHaveBeenCalled();
      expect(localStorage.values.has(restore.APP_RESTORE_JOURNAL_KEY)).toBe(
        true,
      );
    },
  );
});
