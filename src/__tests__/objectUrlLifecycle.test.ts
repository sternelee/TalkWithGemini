import { describe, expect, it, vi } from "vitest";
import {
  resolveObjectUrlWithLifecycle,
  withResolvedObjectUrl,
} from "../lib/utils/objectUrlLifecycle";

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("object URL lifecycle resolver", () => {
  it("passes resolved object URLs to the consumer", async () => {
    const onResolved = vi.fn();

    resolveObjectUrlWithLifecycle({
      source: "opfs://image",
      resolveObjectUrl: async () => "blob:resolved",
      onResolved,
    });

    await Promise.resolve();

    expect(onResolved).toHaveBeenCalledWith("blob:resolved");
  });

  it("revokes URLs that resolve after cancellation", async () => {
    const deferred = createDeferred<string | null>();
    const onResolved = vi.fn();
    const revoke = vi.fn();

    const resolution = resolveObjectUrlWithLifecycle({
      source: "opfs://late",
      resolveObjectUrl: () => deferred.promise,
      onResolved,
      revokeObjectUrl: revoke,
    });

    resolution.cancel();
    deferred.resolve("blob:late");
    await deferred.promise;

    expect(onResolved).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:late");
  });

  it("revokes active URLs during cleanup", async () => {
    const deferred = createDeferred<string | null>();
    const onResolved = vi.fn();
    const revoke = vi.fn();

    const resolution = resolveObjectUrlWithLifecycle({
      source: "opfs://active",
      resolveObjectUrl: () => deferred.promise,
      onResolved,
      revokeObjectUrl: revoke,
    });

    deferred.resolve("blob:active");
    await deferred.promise;
    resolution.cancel();
    resolution.cancel();

    expect(onResolved).toHaveBeenCalledWith("blob:active");
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:active");
  });

  it("ignores errors after cancellation", async () => {
    const deferred = createDeferred<string | null>();
    const onError = vi.fn();

    const resolution = resolveObjectUrlWithLifecycle({
      source: "opfs://error",
      resolveObjectUrl: () => deferred.promise,
      onResolved: vi.fn(),
      onError,
    });

    resolution.cancel();
    deferred.reject(new Error("missing"));
    await deferred.promise.catch(() => {});

    expect(onError).not.toHaveBeenCalled();
  });

  it("reads resolved object URLs and revokes them afterwards", async () => {
    const revoke = vi.fn();
    const read = vi.fn(async () => "content");

    const result = await withResolvedObjectUrl({
      source: "opfs://file",
      resolveObjectUrl: async () => "blob:file",
      read,
      revokeObjectUrl: revoke,
    });

    expect(result).toBe("content");
    expect(read).toHaveBeenCalledWith("blob:file");
    expect(revoke).toHaveBeenCalledWith("blob:file");
  });

  it("does not call read or revoke when resolution returns empty", async () => {
    const revoke = vi.fn();
    const read = vi.fn(async () => "content");

    const result = await withResolvedObjectUrl({
      source: "opfs://missing",
      resolveObjectUrl: async () => null,
      read,
      revokeObjectUrl: revoke,
    });

    expect(result).toBeNull();
    expect(read).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
  });

  it("revokes resolved object URLs when read fails", async () => {
    const revoke = vi.fn();

    await expect(
      withResolvedObjectUrl({
        source: "opfs://broken",
        resolveObjectUrl: async () => "blob:broken",
        read: async () => {
          throw new Error("read failed");
        },
        revokeObjectUrl: revoke,
      }),
    ).rejects.toThrow("read failed");

    expect(revoke).toHaveBeenCalledWith("blob:broken");
  });
});
