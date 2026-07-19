export const APP_RESTORE_JOURNAL_KEY = "neo-chat-restore-journal";
export const APP_RESTORE_SNAPSHOT_KEY = "__neo_chat_restore_snapshot__";
export const APP_RESTORE_WRITE_LOCK_KEY = "neo-chat-restore-write-lock";
export const APP_RESTORE_CREDENTIAL_NOTICE_KEY =
  "neo-chat-restore-credentials-required";
const APP_DATA_WEB_LOCK_NAME = "neo-chat-app-data";

export const APP_RESTORE_CREDENTIAL_AREAS = [
  "providers",
  "search",
  "rag",
  "voice",
  "plugins",
] as const;

export interface AppRestoreCredentialNotice {
  version: 1;
  restoredAt: string;
  areas: typeof APP_RESTORE_CREDENTIAL_AREAS;
}

export type AppRestorePhase =
  "staging" | "applying" | "applied_pending_boot" | "booting";

export const APP_RESTORE_HYDRATION_TARGETS = [
  "coreSettings",
  "settings",
  "chat",
  "knowledge",
  "memory",
] as const;

export type AppRestoreHydrationTarget =
  (typeof APP_RESTORE_HYDRATION_TARGETS)[number];

export interface AppRestoreJournal {
  version: 1;
  transactionId: string;
  phase: AppRestorePhase;
}

export interface AppRestoreDbEntry {
  key: string;
  exists: boolean;
  value?: unknown;
}

export interface AppRestoreSnapshot {
  version: 1;
  transactionId: string;
  managedDbKeys: string[];
  dbEntries: AppRestoreDbEntry[];
  localStorageEntries: AppRestoreDbEntry[];
  stagedOpfsUrls: string[];
  previousOpfsUrls: string[];
}

export interface AppRestoreDb {
  getItem(key: string): Promise<unknown | null>;
  setItem(key: string, value: unknown): Promise<unknown>;
  removeItem(key: string): Promise<void>;
}

interface AppRestoreBootstrapOptions {
  db: AppRestoreDb;
  localStorageRef: LocalStorageLike;
  deleteOpfsUrl: (url: string) => Promise<void>;
  validateRestoredData?: (snapshot: AppRestoreSnapshot) => Promise<void>;
}

interface ActiveRestoreBootstrap extends AppRestoreBootstrapOptions {
  journal: AppRestoreJournal;
  snapshot: AppRestoreSnapshot;
  completedTargets: Set<AppRestoreHydrationTarget>;
  completion: Promise<void>;
  resolveCompletion: () => void;
  rejectCompletion: (error: Error) => void;
  settling?: Promise<void>;
}

type LocalStorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getBrowserLocalStorage(): LocalStorageLike | undefined {
  if (typeof window === "undefined") return undefined;
  const storage = window.localStorage as Partial<LocalStorageLike> | undefined;
  return storage &&
    typeof storage.getItem === "function" &&
    typeof storage.setItem === "function" &&
    typeof storage.removeItem === "function"
    ? (storage as LocalStorageLike)
    : undefined;
}

let pendingExclusiveAppDataTransactionCount = 0;
let activeAppDataWriteCount = 0;
const activeWriteWaiters = new Set<() => void>();
let fallbackSnapshotBarrier: Promise<void> | null = null;
let releaseFallbackSnapshotBarrier: (() => void) | null = null;

function finishTrackedAppDataWrite(): void {
  activeAppDataWriteCount = Math.max(0, activeAppDataWriteCount - 1);
  if (activeAppDataWriteCount !== 0) return;
  for (const resolve of activeWriteWaiters) resolve();
  activeWriteWaiters.clear();
}

function waitForTrackedAppDataWrites(): Promise<void> | undefined {
  if (activeAppDataWriteCount === 0) return undefined;
  return new Promise<void>((resolve) => activeWriteWaiters.add(resolve));
}

function assertPersistedAppDataWritesAllowed(
  localStorageRef = getBrowserLocalStorage(),
): void {
  if (
    bootstrapFailure ||
    localStorageRef?.getItem(APP_RESTORE_WRITE_LOCK_KEY) ||
    localStorageRef?.getItem(APP_RESTORE_JOURNAL_KEY)
  ) {
    throw new Error(
      "App data writes are paused while a restore is in progress.",
    );
  }
}

export function assertAppDataWritesAllowed(
  localStorageRef = getBrowserLocalStorage(),
): void {
  if (pendingExclusiveAppDataTransactionCount > 0) {
    throw new Error(
      "App data writes are paused while a restore is in progress.",
    );
  }
  assertPersistedAppDataWritesAllowed(localStorageRef);
}

export async function runWithAppDataWriteLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  assertAppDataWritesAllowed();
  const locks = globalThis.navigator?.locks;
  if (!locks) {
    if (fallbackSnapshotBarrier) await fallbackSnapshotBarrier;
    // This write was admitted before any subsequently requested exclusive
    // transaction. Only a cross-context persistent gate may revoke it now.
    assertPersistedAppDataWritesAllowed();
    activeAppDataWriteCount += 1;
    try {
      return await operation();
    } finally {
      finishTrackedAppDataWrite();
    }
  }
  return locks.request(APP_DATA_WEB_LOCK_NAME, { mode: "shared" }, async () => {
    // Web Locks preserves request ordering. A write admitted before an
    // exclusive request must be allowed to drain ahead of that transaction,
    // while a persistent gate still rejects writes queued by another context.
    assertPersistedAppDataWritesAllowed();
    return operation();
  });
}

/**
 * Captures a read-only application snapshot without failing writes that begin
 * while it is in progress. Web Locks queues those writes; the fallback barrier
 * provides the same behavior in browsers without that API.
 */
export async function runWithAppDataSnapshotLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  assertAppDataWritesAllowed();
  const locks = globalThis.navigator?.locks;
  if (locks) {
    return locks.request(
      APP_DATA_WEB_LOCK_NAME,
      { mode: "exclusive" },
      async () => {
        assertPersistedAppDataWritesAllowed();
        return operation();
      },
    );
  }

  while (fallbackSnapshotBarrier) await fallbackSnapshotBarrier;
  assertPersistedAppDataWritesAllowed();
  fallbackSnapshotBarrier = new Promise<void>((resolve) => {
    releaseFallbackSnapshotBarrier = resolve;
  });
  try {
    await waitForTrackedAppDataWrites();
    assertPersistedAppDataWritesAllowed();
    return await operation();
  } finally {
    const release = releaseFallbackSnapshotBarrier;
    fallbackSnapshotBarrier = null;
    releaseFallbackSnapshotBarrier = null;
    release?.();
  }
}

async function runTrackedHydrationWrite<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const locks = globalThis.navigator?.locks;
  if (!locks) {
    activeAppDataWriteCount += 1;
    try {
      return await operation();
    } finally {
      finishTrackedAppDataWrite();
    }
  }
  return locks.request(APP_DATA_WEB_LOCK_NAME, { mode: "shared" }, operation);
}

/**
 * Persist middleware may write migrated state while a restored database is
 * being verified. No other business write is allowed through the restore gate.
 */
export async function runWithAppRestoreHydrationWriteLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  return activeRestoreBootstrap
    ? runTrackedHydrationWrite(operation)
    : runWithAppDataWriteLock(operation);
}

export async function runWithExclusiveAppDataLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  pendingExclusiveAppDataTransactionCount += 1;
  const locks = globalThis.navigator?.locks;
  try {
    if (!locks) {
      if (pendingExclusiveAppDataTransactionCount > 1) {
        throw new Error("Another app data transaction is already in progress.");
      }
      while (fallbackSnapshotBarrier) await fallbackSnapshotBarrier;
      await waitForTrackedAppDataWrites();
      return await operation();
    }
    return await locks.request(
      APP_DATA_WEB_LOCK_NAME,
      { mode: "exclusive" },
      operation,
    );
  } finally {
    pendingExclusiveAppDataTransactionCount = Math.max(
      0,
      pendingExclusiveAppDataTransactionCount - 1,
    );
  }
}

/**
 * Runs a destructive clear while keeping a cross-context write gate in place
 * until the caller reloads the page. A failed clear releases its own gate so
 * the current application can continue using the untouched data.
 */
export async function runWithExclusiveAppDataClearLock<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const localStorageRef = getBrowserLocalStorage();
  if (!localStorageRef) return runWithExclusiveAppDataLock(operation);

  assertAppDataWritesAllowed(localStorageRef);
  const transactionId = `clear-${(
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
  )
    .replace(/[^a-z0-9-]/gi, "")
    .slice(0, 48)}`;
  const runWithGate = async () => {
    acquireAppRestoreWriteGate(localStorageRef, transactionId);
    try {
      return await operation();
    } catch (error) {
      releaseAppRestoreWriteGate(localStorageRef, transactionId);
      throw error;
    }
  };

  if (globalThis.navigator?.locks) {
    // Acquire the persistent gate only after earlier shared requests have
    // drained. Cross-context writes requested later are queued behind this
    // callback and will observe the retained gate before they can mutate data.
    return runWithExclusiveAppDataLock(runWithGate);
  }

  // Without Web Locks, publish the cross-context gate before waiting for the
  // locally tracked writes. Session writes admitted earlier are already
  // tracked synchronously and therefore still drain before the clear begins.
  acquireAppRestoreWriteGate(localStorageRef, transactionId);
  try {
    return await runWithExclusiveAppDataLock(operation);
  } catch (error) {
    releaseAppRestoreWriteGate(localStorageRef, transactionId);
    throw error;
  }
}

export function acquireAppRestoreWriteGate(
  localStorageRef: LocalStorageLike,
  transactionId: string,
): void {
  const current = localStorageRef.getItem(APP_RESTORE_WRITE_LOCK_KEY);
  if (current && current !== transactionId) {
    throw new Error("Another app data restore is already in progress.");
  }
  localStorageRef.setItem(APP_RESTORE_WRITE_LOCK_KEY, transactionId);
  if (localStorageRef.getItem(APP_RESTORE_WRITE_LOCK_KEY) !== transactionId) {
    throw new Error("Could not acquire the app data restore write gate.");
  }
}

export function releaseAppRestoreWriteGate(
  localStorageRef: LocalStorageLike,
  transactionId: string,
): void {
  if (localStorageRef.getItem(APP_RESTORE_WRITE_LOCK_KEY) === transactionId) {
    localStorageRef.removeItem(APP_RESTORE_WRITE_LOCK_KEY);
  }
}

export function writeAppRestoreCredentialNotice(
  localStorageRef: LocalStorageLike,
  restoredAt = new Date().toISOString(),
): void {
  const notice: AppRestoreCredentialNotice = {
    version: 1,
    restoredAt,
    areas: APP_RESTORE_CREDENTIAL_AREAS,
  };
  localStorageRef.setItem(
    APP_RESTORE_CREDENTIAL_NOTICE_KEY,
    JSON.stringify(notice),
  );
}

export function readAppRestoreCredentialNotice(
  localStorageRef = getBrowserLocalStorage(),
): AppRestoreCredentialNotice | null {
  const raw = localStorageRef?.getItem(APP_RESTORE_CREDENTIAL_NOTICE_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AppRestoreCredentialNotice>;
    if (
      value.version !== 1 ||
      typeof value.restoredAt !== "string" ||
      !Number.isFinite(Date.parse(value.restoredAt)) ||
      !Array.isArray(value.areas) ||
      APP_RESTORE_CREDENTIAL_AREAS.some((area) => !value.areas?.includes(area))
    ) {
      return null;
    }
    return {
      version: 1,
      restoredAt: value.restoredAt,
      areas: APP_RESTORE_CREDENTIAL_AREAS,
    };
  } catch {
    return null;
  }
}

export function clearAppRestoreCredentialNotice(
  localStorageRef = getBrowserLocalStorage(),
): void {
  localStorageRef?.removeItem(APP_RESTORE_CREDENTIAL_NOTICE_KEY);
}

function parseJournal(value: string | null): AppRestoreJournal | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as {
      version?: unknown;
      transactionId?: unknown;
      phase?: unknown;
    };
    if (
      parsed.version !== 1 ||
      typeof parsed.transactionId !== "string" ||
      (parsed.phase !== "staging" &&
        parsed.phase !== "applying" &&
        parsed.phase !== "applied_pending_boot" &&
        parsed.phase !== "booting" &&
        parsed.phase !== "committed")
    ) {
      return null;
    }
    return {
      version: 1,
      transactionId: parsed.transactionId,
      // `committed` was emitted by early v3 builds. It had not yet verified
      // hydration, so it must enter the same boot-confirmation path.
      phase:
        parsed.phase === "committed" ? "applied_pending_boot" : parsed.phase,
    };
  } catch {
    return null;
  }
}

function isSnapshot(
  value: unknown,
  transactionId: string,
): value is AppRestoreSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const snapshot = value as Partial<AppRestoreSnapshot>;
  return (
    snapshot.version === 1 &&
    snapshot.transactionId === transactionId &&
    Array.isArray(snapshot.managedDbKeys) &&
    Array.isArray(snapshot.dbEntries) &&
    Array.isArray(snapshot.localStorageEntries) &&
    Array.isArray(snapshot.stagedOpfsUrls) &&
    Array.isArray(snapshot.previousOpfsUrls) &&
    snapshot.managedDbKeys.every((key) => typeof key === "string") &&
    snapshot.dbEntries.every((entry) =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        typeof (entry as Partial<AppRestoreDbEntry>).key === "string" &&
        typeof (entry as Partial<AppRestoreDbEntry>).exists === "boolean",
      ),
    ) &&
    snapshot.localStorageEntries.every((entry) =>
      Boolean(
        entry &&
        typeof entry === "object" &&
        typeof (entry as Partial<AppRestoreDbEntry>).key === "string" &&
        typeof (entry as Partial<AppRestoreDbEntry>).exists === "boolean",
      ),
    ) &&
    snapshot.stagedOpfsUrls.every((url) => typeof url === "string") &&
    snapshot.previousOpfsUrls.every((url) => typeof url === "string")
  );
}

async function removeOpfsUrls(
  urls: readonly string[],
  deleteOpfsUrl: (url: string) => Promise<void>,
): Promise<void> {
  for (const url of new Set(urls)) {
    try {
      await deleteOpfsUrl(url);
    } catch {
      // Cleanup is best effort; restored state no longer references this file.
    }
  }
}

async function rollbackRestore(
  db: AppRestoreDb,
  localStorageRef: LocalStorageLike,
  snapshot: AppRestoreSnapshot,
): Promise<void> {
  for (const key of snapshot.managedDbKeys) {
    await db.removeItem(key);
  }

  for (const entry of snapshot.dbEntries) {
    if (entry.exists) {
      await db.setItem(entry.key, entry.value);
    }
  }

  for (const entry of snapshot.localStorageEntries) {
    if (entry.exists && typeof entry.value === "string") {
      localStorageRef.setItem(entry.key, entry.value);
    } else {
      localStorageRef.removeItem(entry.key);
    }
  }
}

export function hasInterruptedAppRestore(
  localStorageRef: LocalStorageLike,
): boolean {
  return Boolean(
    localStorageRef.getItem(APP_RESTORE_JOURNAL_KEY) ||
    localStorageRef.getItem(APP_RESTORE_WRITE_LOCK_KEY),
  );
}

let recoveryPromise: Promise<void> | null = null;
let bootstrapInitializationPromise: Promise<void> | null = null;
let activeRestoreBootstrap: ActiveRestoreBootstrap | null = null;
let bootstrapFailure: Error | null = null;

function toError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new Error(fallback);
}

async function clearRestoreTransaction(options: {
  db: AppRestoreDb;
  localStorageRef: LocalStorageLike;
  deleteOpfsUrl: (url: string) => Promise<void>;
  journal: AppRestoreJournal;
  snapshot: AppRestoreSnapshot;
  commit: boolean;
}): Promise<void> {
  const { db, localStorageRef, deleteOpfsUrl, journal, snapshot, commit } =
    options;
  if (commit) {
    // This is the durable commit point. Until the journal is removed, the
    // previous database and files must remain available for rollback.
    localStorageRef.removeItem(APP_RESTORE_JOURNAL_KEY);
    await db.removeItem(APP_RESTORE_SNAPSHOT_KEY);
    releaseAppRestoreWriteGate(localStorageRef, journal.transactionId);

    // Cleanup after the commit point may leave harmless orphans if interrupted,
    // but it can no longer make a later rollback lose its files.
    const stagedUrls = new Set(snapshot.stagedOpfsUrls);
    await removeOpfsUrls(
      snapshot.previousOpfsUrls.filter((url) => !stagedUrls.has(url)),
      deleteOpfsUrl,
    );
    return;
  }

  await rollbackRestore(db, localStorageRef, snapshot);
  await removeOpfsUrls(snapshot.stagedOpfsUrls, deleteOpfsUrl);
  await db.removeItem(APP_RESTORE_SNAPSHOT_KEY);
  localStorageRef.removeItem(APP_RESTORE_JOURNAL_KEY);
  releaseAppRestoreWriteGate(localStorageRef, journal.transactionId);
}

async function readRestoreTransaction(options: {
  db: AppRestoreDb;
  localStorageRef: LocalStorageLike;
}): Promise<
  { journal: AppRestoreJournal; snapshot: AppRestoreSnapshot } | undefined
> {
  const { db, localStorageRef } = options;
  const rawJournal = localStorageRef.getItem(APP_RESTORE_JOURNAL_KEY);
  const writeGateTransactionId = localStorageRef.getItem(
    APP_RESTORE_WRITE_LOCK_KEY,
  );
  if (!rawJournal && !writeGateTransactionId) return undefined;
  if (!rawJournal && writeGateTransactionId) {
    await db.removeItem(APP_RESTORE_SNAPSHOT_KEY);
    releaseAppRestoreWriteGate(localStorageRef, writeGateTransactionId);
    return undefined;
  }
  const journal = parseJournal(rawJournal);
  if (!journal) {
    throw new Error(
      "Restore recovery is blocked because its journal is invalid.",
    );
  }
  if (
    writeGateTransactionId &&
    writeGateTransactionId !== journal.transactionId
  ) {
    throw new Error(
      "Restore recovery is blocked because its write gate does not match the journal.",
    );
  }
  const value = await db.getItem(APP_RESTORE_SNAPSHOT_KEY);
  if (!isSnapshot(value, journal.transactionId)) {
    throw new Error(
      "Restore recovery is blocked because its rollback snapshot is missing or invalid.",
    );
  }
  return { journal, snapshot: value };
}

/**
 * Rolls back a restore that is interrupted before its next-boot hydration is
 * explicitly confirmed. Application startup uses prepareAppRestoreHydration
 * instead, so applied data is never finalized before every store is verified.
 * The common no-journal path is synchronous and performs no IndexedDB work.
 */
export function ensureInterruptedAppRestoreRecovery(options: {
  db: AppRestoreDb;
  localStorageRef: LocalStorageLike;
  deleteOpfsUrl: (url: string) => Promise<void>;
  exclusiveLockHeld?: boolean;
}): Promise<void> | undefined {
  const { db, localStorageRef, deleteOpfsUrl, exclusiveLockHeld } = options;
  if (!hasInterruptedAppRestore(localStorageRef)) return undefined;

  const recover = async () => {
    const transaction = await readRestoreTransaction({ db, localStorageRef });
    if (!transaction) return;
    await clearRestoreTransaction({
      db,
      localStorageRef,
      deleteOpfsUrl,
      ...transaction,
      commit: false,
    });
  };

  // A restore that already owns the exclusive lock must never await a recovery
  // queued behind that same lock. Recover in place; queued callers re-read the
  // journal after the lock is released and safely become no-ops.
  if (exclusiveLockHeld) return recover();
  if (recoveryPromise) return recoveryPromise;

  recoveryPromise = runWithExclusiveAppDataLock(recover).finally(() => {
    recoveryPromise = null;
  });

  return recoveryPromise;
}

/**
 * Starts the one-time verification boot for newly applied data. A journal
 * already in `booting` belongs to a previous interrupted page load and is
 * rolled back before any store reads it.
 */
export function prepareAppRestoreHydration(
  options: AppRestoreBootstrapOptions,
): Promise<void> | undefined {
  if (!hasInterruptedAppRestore(options.localStorageRef)) return undefined;
  if (bootstrapFailure) return Promise.reject(bootstrapFailure);
  if (activeRestoreBootstrap) return undefined;
  if (bootstrapInitializationPromise) return bootstrapInitializationPromise;

  bootstrapInitializationPromise = runWithExclusiveAppDataLock(async () => {
    const transaction = await readRestoreTransaction(options);
    if (!transaction) return;
    const { journal, snapshot } = transaction;

    if (journal.phase !== "applied_pending_boot") {
      await clearRestoreTransaction({
        ...options,
        journal,
        snapshot,
        commit: false,
      });
      return;
    }

    acquireAppRestoreWriteGate(options.localStorageRef, journal.transactionId);
    const bootJournal: AppRestoreJournal = {
      ...journal,
      phase: "booting",
    };
    options.localStorageRef.setItem(
      APP_RESTORE_JOURNAL_KEY,
      JSON.stringify(bootJournal),
    );

    let resolveCompletion: (() => void) | undefined;
    let rejectCompletion: ((error: Error) => void) | undefined;
    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    activeRestoreBootstrap = {
      ...options,
      journal: bootJournal,
      snapshot,
      completedTargets: new Set(),
      completion,
      resolveCompletion: resolveCompletion!,
      rejectCompletion: rejectCompletion!,
    };
  })
    .catch((error) => {
      bootstrapFailure = toError(error, "Restore startup preparation failed.");
      throw bootstrapFailure;
    })
    .finally(() => {
      bootstrapInitializationPromise = null;
    });

  return bootstrapInitializationPromise;
}

export function isAppRestoreHydrationInProgress(): boolean {
  return activeRestoreBootstrap !== null || bootstrapFailure !== null;
}

function settleRestoreHydration(
  context: ActiveRestoreBootstrap,
  hydrationError?: Error,
): Promise<void> {
  if (context.settling) return context.completion;

  let failure = hydrationError;
  context.settling = runWithExclusiveAppDataLock(async () => {
    const transaction = await readRestoreTransaction(context);
    if (
      !transaction ||
      transaction.journal.transactionId !== context.journal.transactionId ||
      transaction.journal.phase !== "booting"
    ) {
      throw new Error(
        "Restore hydration confirmation no longer matches its transaction.",
      );
    }

    if (!failure) {
      try {
        await context.validateRestoredData?.(transaction.snapshot);
      } catch (error) {
        failure = toError(
          error,
          "Restored application data failed validation during startup.",
        );
      }
    }

    await clearRestoreTransaction({
      ...context,
      ...transaction,
      commit: !failure,
    });
  });

  void context.settling.then(
    () => {
      if (activeRestoreBootstrap === context) activeRestoreBootstrap = null;
      if (failure) {
        bootstrapFailure = failure;
        context.rejectCompletion(failure);
      } else {
        bootstrapFailure = null;
        context.resolveCompletion();
      }
    },
    (error) => {
      if (activeRestoreBootstrap === context) activeRestoreBootstrap = null;
      bootstrapFailure = toError(
        error,
        "Restore hydration confirmation failed.",
      );
      context.rejectCompletion(bootstrapFailure);
    },
  );
  return context.completion;
}

/**
 * Store hydration callbacks wait on the same completion promise. This delays
 * their `_hasHydrated` updates until all five stores and every message tree are
 * validated and the restore transaction is durably finalized.
 */
export async function reportAppRestoreHydration(
  target: AppRestoreHydrationTarget,
  error?: unknown,
): Promise<void> {
  if (bootstrapInitializationPromise) await bootstrapInitializationPromise;
  if (bootstrapFailure) throw bootstrapFailure;
  const context = activeRestoreBootstrap;
  if (!context) return;

  if (error) {
    return settleRestoreHydration(
      context,
      toError(error, `Restored ${target} state failed to hydrate.`),
    );
  }
  context.completedTargets.add(target);
  if (
    APP_RESTORE_HYDRATION_TARGETS.every((candidate) =>
      context.completedTargets.has(candidate),
    )
  ) {
    return settleRestoreHydration(context);
  }
  return context.completion;
}
