import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const safeFetchArrayBufferMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("../lib/security/safeFetch", () => ({
  safeFetchArrayBuffer: safeFetchArrayBufferMock,
}));
vi.mock("../lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);
vi.mock("../lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

const createRequest = (body: unknown) =>
  new NextRequest("https://neo.test/api/media/image-proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("message image proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    safeFetchArrayBufferMock.mockReset();
  });

  it("returns supported upstream image bytes with a safe content type", async () => {
    const bytes = Uint8Array.from([1, 2, 3]).buffer;
    safeFetchArrayBufferMock.mockResolvedValue({
      response: new Response(null, {
        status: 200,
        headers: { "content-type": "image/png; charset=binary" },
      }),
      arrayBuffer: bytes,
    });

    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({
        url: "https://platform-outputs.agnes-ai.space/images/t2i/image.png",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.arrayBuffer()).resolves.toEqual(bytes);
    const upstreamUrl = safeFetchArrayBufferMock.mock.calls[0]?.[0] as URL;
    expect(upstreamUrl.toString()).toBe(
      "https://platform-outputs.agnes-ai.space/images/t2i/image.png",
    );
    expect(safeFetchArrayBufferMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "image/*" },
      }),
      expect.objectContaining({
        maxResponseBytes: 10 * 1024 * 1024,
        policy: expect.objectContaining({ context: "image" }),
      }),
    );
  });

  it("rejects malformed proxy requests before fetching upstream", async () => {
    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(createRequest({ url: "not-a-url" }));

    expect(response.status).toBe(400);
    expect(safeFetchArrayBufferMock).not.toHaveBeenCalled();
  });

  it("rejects upstream responses that are not supported raster images", async () => {
    safeFetchArrayBufferMock.mockResolvedValue({
      response: new Response(null, {
        status: 200,
        headers: { "content-type": "image/svg+xml" },
      }),
      arrayBuffer: new ArrayBuffer(0),
    });

    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({ url: "https://example.com/image.svg" }),
    );

    expect(response.status).toBe(415);
  });
});
