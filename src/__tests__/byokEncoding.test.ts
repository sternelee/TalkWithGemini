import { Buffer as NodeBuffer } from "node:buffer";
import { afterEach, describe, expect, it } from "vitest";
import { base64UrlToBytes, bytesToBase64Url } from "../lib/byok/encoding";

const originalBufferDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "Buffer",
);

function restoreBuffer(): void {
  if (originalBufferDescriptor) {
    Object.defineProperty(globalThis, "Buffer", originalBufferDescriptor);
    return;
  }

  delete (globalThis as unknown as { Buffer?: typeof Buffer }).Buffer;
}

describe("BYOK base64url encoding", () => {
  afterEach(() => {
    restoreBuffer();
  });

  it("encodes URL-safe base64 without padding", () => {
    const encoded = bytesToBase64Url(
      new Uint8Array([251, 255, 255, 250, 0, 1, 2]),
    );

    expect(encoded).not.toMatch(/[+/=]/);
    expect(encoded).toBe("-___-gABAg");
  });

  it("roundtrips byte arrays", () => {
    const bytes = new Uint8Array(
      Array.from({ length: 256 }, (_, index) => index),
    );
    const decoded = base64UrlToBytes(bytesToBase64Url(bytes));

    expect(Array.from(decoded)).toEqual(Array.from(bytes));
  });

  it("does not require Buffer base64url support", () => {
    Object.defineProperty(globalThis, "Buffer", {
      configurable: true,
      value: {
        from(value: ArrayLike<number> | string, encoding?: BufferEncoding) {
          if (encoding === "base64url") {
            throw new TypeError("Unknown encoding: base64url");
          }
          if (typeof value === "string") {
            return NodeBuffer.from(value, encoding);
          }
          return NodeBuffer.from(value);
        },
      },
    });

    const bytes = new Uint8Array([222, 173, 190, 239]);
    const encoded = bytesToBase64Url(bytes);

    expect(encoded).toBe("3q2-7w");
    expect(Array.from(base64UrlToBytes(encoded))).toEqual(Array.from(bytes));
  });
});
