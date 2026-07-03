import { describe, expect, it, vi } from "vitest";
import { stopMediaStreamTracks } from "../lib/utils/mediaRecording";

describe("media recording utilities", () => {
  it("stops every track in a stream", () => {
    const first = { stop: vi.fn() };
    const second = { stop: vi.fn() };

    const stopped = stopMediaStreamTracks({
      getTracks: () => [first, second],
    });

    expect(stopped).toBe(2);
    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it("continues stopping tracks when one track throws", () => {
    const first = {
      stop: vi.fn(() => {
        throw new Error("device failure");
      }),
    };
    const second = { stop: vi.fn() };

    const stopped = stopMediaStreamTracks({
      getTracks: () => [first, second],
    });

    expect(stopped).toBe(1);
    expect(first.stop).toHaveBeenCalledOnce();
    expect(second.stop).toHaveBeenCalledOnce();
  });

  it("tolerates missing streams", () => {
    expect(stopMediaStreamTracks(null)).toBe(0);
  });
});
