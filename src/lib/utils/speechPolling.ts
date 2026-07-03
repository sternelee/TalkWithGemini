export interface DisposablePoller {
  dispose: () => void;
}

interface SpeechSynthesisPollerOptions {
  isSpeaking: () => boolean;
  onIdle: () => void;
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

export function createSpeechSynthesisPoller({
  isSpeaking,
  onIdle,
  intervalMs = 500,
  setIntervalFn = setInterval,
  clearIntervalFn = clearInterval,
}: SpeechSynthesisPollerOptions): DisposablePoller {
  let disposed = false;
  const intervalId = setIntervalFn(() => {
    if (disposed || isSpeaking()) return;

    disposed = true;
    clearIntervalFn(intervalId);
    onIdle();
  }, intervalMs);

  return {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      clearIntervalFn(intervalId);
    },
  };
}
