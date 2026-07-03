import { describe, expect, it, vi } from "vitest";
import { createTimedStatusResetController } from "../lib/utils/timedStatus";

describe("timed status reset controller", () => {
  it("sets status and resets it after the delay", () => {
    let callback: (() => void) | undefined;
    const setStatus = vi.fn();
    const clearTimeoutFn = vi.fn();

    createTimedStatusResetController({
      setStatus,
      resetValue: "idle",
      setTimeoutFn: ((fn: () => void) => {
        callback = fn;
        return 1 as unknown as ReturnType<typeof setTimeout>;
      }) as typeof setTimeout,
      clearTimeoutFn,
    }).set("copied");

    expect(setStatus).toHaveBeenCalledWith("copied");
    callback?.();
    expect(setStatus).toHaveBeenLastCalledWith("idle");
  });

  it("clears previous reset timers before scheduling a new one", () => {
    const setStatus = vi.fn();
    const clearTimeoutFn = vi.fn();
    let nextTimeoutId = 1;

    const controller = createTimedStatusResetController({
      setStatus,
      resetValue: "idle",
      setTimeoutFn: (() =>
        nextTimeoutId++ as unknown as ReturnType<
          typeof setTimeout
        >) as unknown as typeof setTimeout,
      clearTimeoutFn,
    });

    controller.set("copied");
    controller.set("error");

    expect(clearTimeoutFn).toHaveBeenCalledTimes(1);
    expect(clearTimeoutFn).toHaveBeenCalledWith(1);
    expect(setStatus).toHaveBeenNthCalledWith(1, "copied");
    expect(setStatus).toHaveBeenNthCalledWith(2, "error");
  });

  it("disposes the pending reset and ignores future sets", () => {
    const setStatus = vi.fn();
    const clearTimeoutFn = vi.fn();

    const controller = createTimedStatusResetController({
      setStatus,
      resetValue: "idle",
      setTimeoutFn: (() =>
        9 as unknown as ReturnType<
          typeof setTimeout
        >) as unknown as typeof setTimeout,
      clearTimeoutFn,
    });

    controller.set("copied");
    controller.dispose();
    controller.dispose();
    controller.set("error");

    expect(clearTimeoutFn).toHaveBeenCalledTimes(1);
    expect(clearTimeoutFn).toHaveBeenCalledWith(9);
    expect(setStatus).toHaveBeenCalledTimes(1);
    expect(setStatus).toHaveBeenCalledWith("copied");
  });
});
