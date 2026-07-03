type TimeoutHandle = ReturnType<typeof setTimeout>;

interface TimedStatusResetOptions<T> {
  setStatus: (value: T) => void;
  resetValue: T;
  delayMs?: number;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export interface TimedStatusResetController<T> {
  set: (value: T, options?: { resetValue?: T; delayMs?: number }) => void;
  clear: () => void;
  dispose: () => void;
}

export function createTimedStatusResetController<T>({
  setStatus,
  resetValue,
  delayMs = 2_000,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout,
}: TimedStatusResetOptions<T>): TimedStatusResetController<T> {
  let timeout: TimeoutHandle | null = null;
  let disposed = false;

  const clear = () => {
    if (timeout === null) return;
    clearTimeoutFn(timeout);
    timeout = null;
  };

  const controller: TimedStatusResetController<T> = {
    set: (value, options) => {
      if (disposed) return;

      clear();
      setStatus(value);

      const nextResetValue = options?.resetValue ?? resetValue;
      const nextDelayMs = options?.delayMs ?? delayMs;
      timeout = setTimeoutFn(() => {
        timeout = null;
        if (!disposed) setStatus(nextResetValue);
      }, nextDelayMs);
    },
    clear,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clear();
    },
  };

  return controller;
}
