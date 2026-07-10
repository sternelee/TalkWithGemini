const sessionMessageWriteQueues = new Map<string, Promise<void>>();

export async function enqueueSessionMessageWrite(
  sessionId: string,
  write: () => Promise<void>,
): Promise<void> {
  const previousWrite = sessionMessageWriteQueues.get(sessionId);
  const queuedWrite = previousWrite
    ? previousWrite.catch(() => undefined).then(write)
    : write();

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
