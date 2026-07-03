import { describe, expect, it, vi } from "vitest";
import {
  attachObjectUrlDisposal,
  createDisposableAudioFromBlob,
} from "../lib/utils/disposableAudio";

function createFakeAudio() {
  const listeners = new Map<string, EventListener>();
  return {
    paused: false,
    pause: vi.fn(),
    addEventListener: vi.fn((event: string, listener: EventListener) => {
      listeners.set(event, listener);
    }),
    removeEventListener: vi.fn((event: string) => {
      listeners.delete(event);
    }),
    emit(event: string) {
      listeners.get(event)?.(new Event(event));
    },
  } as unknown as HTMLAudioElement & { emit: (event: string) => void };
}

describe("disposable audio helpers", () => {
  it("revokes object URLs once when disposed", () => {
    const audio = createFakeAudio();
    const revoke = vi.fn();
    const disposable = attachObjectUrlDisposal(audio, "blob:test", revoke);

    disposable.dispose();
    disposable.dispose();

    expect(audio.pause).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:test");
  });

  it("revokes object URLs when playback ends", () => {
    const audio = createFakeAudio();
    const revoke = vi.fn();
    attachObjectUrlDisposal(audio, "blob:ended", revoke);

    audio.emit("ended");

    expect(revoke).toHaveBeenCalledWith("blob:ended");
  });

  it("creates disposable audio from a blob", () => {
    const audio = createFakeAudio();
    const createObjectUrl = vi.fn(() => "blob:created");
    const revoke = vi.fn();

    const disposable = createDisposableAudioFromBlob(
      new Blob(["audio"]),
      () => audio,
      createObjectUrl,
      revoke,
    );

    disposable.dispose();

    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:created");
  });
});
