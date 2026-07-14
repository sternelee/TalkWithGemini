import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const safeFetchMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("../lib/security/safeFetch", async () => ({
  ...(await vi.importActual("../lib/security/safeFetch")),
  safeFetch: safeFetchMock,
}));
vi.mock("../lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);
vi.mock("../lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

const PNG_BYTES = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
]);
const OTHER_IMAGE_SAMPLES: Array<[string, number[]]> = [
  ["image/jpeg", [0xff, 0xd8, 0xff, 0x00]],
  ["image/gif", Array.from("GIF89a", (value) => value.charCodeAt(0))],
  ["image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  [
    "image/avif",
    [
      0, 0, 0, 20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66, 0, 0, 0, 0,
      0x61, 0x76, 0x69, 0x66,
    ],
  ],
];

const createRequest = (body: unknown) =>
  new NextRequest("https://neo.test/api/media/image-proxy", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const createUpstreamResponse = (
  body: BodyInit | null,
  {
    status = 200,
    contentType = "image/png",
    contentLength,
  }: {
    status?: number;
    contentType?: string;
    contentLength?: string;
  } = {},
) =>
  new Response(body, {
    status,
    headers: {
      "content-type": contentType,
      ...(contentLength ? { "content-length": contentLength } : {}),
    },
  });

describe("message image proxy route", () => {
  beforeEach(() => {
    vi.resetModules();
    safeFetchMock.mockReset();
  });

  it("returns verified upstream image bytes with safe response headers", async () => {
    safeFetchMock.mockResolvedValue(
      createUpstreamResponse(PNG_BYTES.buffer as ArrayBuffer, {
        contentType: "image/png; charset=binary",
      }),
    );

    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({
        url: "https://platform-outputs.agnes-ai.space/images/t2i/image.png?1783932550979",
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-length")).toBe(
      String(PNG_BYTES.byteLength),
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.arrayBuffer()).resolves.toEqual(
      PNG_BYTES.buffer as ArrayBuffer,
    );
    const upstreamUrl = safeFetchMock.mock.calls[0]?.[0] as URL;
    expect(upstreamUrl.toString()).toBe(
      "https://platform-outputs.agnes-ai.space/images/t2i/image.png?1783932550979",
    );
    expect(safeFetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "GET",
        headers: { Accept: "image/*" },
      }),
      expect.objectContaining({
        enforceResponseLimits: true,
        maxResponseBytes: 10 * 1024 * 1024,
        policy: expect.objectContaining({ context: "image" }),
      }),
    );
  });

  it.each(OTHER_IMAGE_SAMPLES)(
    "preserves supported %s images after signature validation",
    async (contentType, sample) => {
      const bytes = Uint8Array.from(sample);
      safeFetchMock.mockResolvedValue(
        createUpstreamResponse(bytes.buffer as ArrayBuffer, { contentType }),
      );

      const { POST } = await import("../app/api/media/image-proxy/route");
      const response = await POST(
        createRequest({ url: `https://example.com/image.${contentType}` }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(contentType);
      await expect(response.arrayBuffer()).resolves.toEqual(
        bytes.buffer as ArrayBuffer,
      );
    },
  );

  it("rejects an oversized request body before fetching upstream", async () => {
    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({
        url: "https://example.com/image.png",
        padding: "x".repeat(5 * 1024),
      }),
    );

    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      code: "PAYLOAD_TOO_LARGE",
      statusCode: 413,
    });
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed proxy requests before fetching upstream", async () => {
    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(createRequest({ url: "not-a-url" }));

    expect(response.status).toBe(400);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("rejects an unsupported content type before reading the body", async () => {
    const upstream = createUpstreamResponse("<svg/>", {
      contentType: "image/svg+xml",
    });
    const cancel = vi.spyOn(upstream.body!, "cancel");
    safeFetchMock.mockResolvedValue(upstream);

    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({ url: "https://example.com/image.svg" }),
    );

    expect(response.status).toBe(415);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      code: "UNSUPPORTED_IMAGE_CONTENT_TYPE",
      statusCode: 415,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects a declared oversized image before reading the body", async () => {
    const upstream = createUpstreamResponse(PNG_BYTES.buffer as ArrayBuffer, {
      contentLength: String(10 * 1024 * 1024 + 1),
    });
    const cancel = vi.spyOn(upstream.body!, "cancel");
    safeFetchMock.mockResolvedValue(upstream);

    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({ url: "https://example.com/large.png" }),
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      code: "RESPONSE_SIZE_LIMIT",
      statusCode: 502,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects bytes that do not match the declared image type", async () => {
    safeFetchMock.mockResolvedValue(
      createUpstreamResponse(Uint8Array.from([1, 2, 3]).buffer as ArrayBuffer),
    );

    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({ url: "https://example.com/not-really-an-image.png" }),
    );

    expect(response.status).toBe(415);
    expect(await response.json()).toMatchObject({
      code: "IMAGE_CONTENT_MISMATCH",
      statusCode: 415,
    });
  });

  it("cancels an unsuccessful upstream response without reading its body", async () => {
    const upstream = createUpstreamResponse("not found", { status: 404 });
    const cancel = vi.spyOn(upstream.body!, "cancel");
    safeFetchMock.mockResolvedValue(upstream);

    const { POST } = await import("../app/api/media/image-proxy/route");
    const response = await POST(
      createRequest({ url: "https://example.com/missing.png" }),
    );

    expect(response.status).toBe(502);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      code: "UPSTREAM_IMAGE_FETCH_FAILED",
      statusCode: 502,
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
