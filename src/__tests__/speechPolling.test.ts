import { describe, expect, it, vi } from "vitest";
import { createSpeechSynthesisPoller } from "../lib/utils/speechPolling";

describe("speech synthesis poller", () => {
  it("calls onIdle once and clears the interval when speech becomes idle", () => {
    let callback: (() => void) | undefined;
    let speaking = true;
    const clearIntervalFn = vi.fn();
    const onIdle = vi.fn();

    createSpeechSynthesisPoller({
      isSpeaking: () => speaking,
      onIdle,
      setIntervalFn: ((fn: () => void) => {
        callback = fn;
        return 7 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval,
      clearIntervalFn,
    });

    callback?.();
    expect(onIdle).not.toHaveBeenCalled();

    speaking = false;
    callback?.();
    callback?.();

    expect(onIdle).toHaveBeenCalledTimes(1);
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
    expect(clearIntervalFn).toHaveBeenCalledWith(7);
  });

  it("disposes polling before idle callbacks can update state", () => {
    let callback: (() => void) | undefined;
    const clearIntervalFn = vi.fn();
    const onIdle = vi.fn();

    const poller = createSpeechSynthesisPoller({
      isSpeaking: () => false,
      onIdle,
      setIntervalFn: ((fn: () => void) => {
        callback = fn;
        return 12 as unknown as ReturnType<typeof setInterval>;
      }) as typeof setInterval,
      clearIntervalFn,
    });

    poller.dispose();
    poller.dispose();
    callback?.();

    expect(onIdle).not.toHaveBeenCalled();
    expect(clearIntervalFn).toHaveBeenCalledTimes(1);
    expect(clearIntervalFn).toHaveBeenCalledWith(12);
  });
});
