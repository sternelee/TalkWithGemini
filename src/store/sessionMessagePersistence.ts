import {
  assertAppDataWritesAllowed,
  runWithAppDataWriteLock,
} from "@/lib/data/appRestoreJournal";

const sessionMessageWriteQueues = new Map<string, Promise<void>>();

export async function enqueueSessionMessageWrite(
  sessionId: string,
  write: () => Promise<void>,
): Promise<void> {
  assertAppDataWritesAllowed();
  const previousWrite = sessionMessageWriteQueues.get(sessionId);
  const queuedWrite = previousWrite
    ? runWithAppDataWriteLock(async () => {
        await previousWrite.catch(() => undefined);
        await write();
      })
    : runWithAppDataWriteLock(write);

  sessionMessageWriteQueues.set(sessionId, queuedWrite);

  try {
    await queuedWrite;
  } finally {
    if (sessionMessageWriteQueues.get(sessionId) === queuedWrite) {
      sessionMessageWriteQueues.delete(sessionId);
    }
  }
}

export function waitForSessionMessageWrites(
  sessionId: string,
): Promise<void> | undefined {
  return sessionMessageWriteQueues.get(sessionId);
}

export async function flushSessionMessageWrites(): Promise<void> {
  while (sessionMessageWriteQueues.size > 0) {
    await Promise.all(Array.from(sessionMessageWriteQueues.values()));
  }
}
