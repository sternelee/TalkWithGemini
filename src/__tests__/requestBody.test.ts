import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertRequestContentLengthUnderLimit,
  logRequest,
  readJsonRequestBody,
  withApiHandler,
  withStreamApiHandler,
} from "../lib/api/middleware";
import { ApiError } from "../lib/errors";

describe("request body helpers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("reads JSON request bodies within the byte limit", async () => {
    await expect(
      readJsonRequestBody(
        new Request("https://example.test/api", {
          method: "POST",
          body: JSON.stringify({ ok: true }),
        }),
        1024,
      ),
    ).resolves.toEqual({ ok: true });
  });

  it("rejects bodies that exceed the declared content length limit", async () => {
    await expect(
      readJsonRequestBody(
        new Request("https://example.test/api", {
          method: "POST",
          headers: { "content-length": "100" },
          body: "{}",
        }),
        10,
      ),
    ).rejects.toMatchObject({
      name: "PayloadTooLargeError",
      statusCode: 413,
    });
  });

  it("rejects streamed bodies that exceed the byte limit", async () => {
    await expect(
      readJsonRequestBody(
        new Request("https://example.test/api", {
          method: "POST",
          body: JSON.stringify({ text: "too long" }),
        }),
        8,
      ),
    ).rejects.toMatchObject({
      name: "PayloadTooLargeError",
      statusCode: 413,
    });
  });

  it("rejects malformed JSON as a validation error", async () => {
    await expect(
      readJsonRequestBody(
        new Request("https://example.test/api", {
          method: "POST",
          body: "{not-json",
        }),
        1024,
      ),
    ).rejects.toMatchObject({
      name: "ValidationError",
      statusCode: 400,
    });
  });

  it("rejects declared oversized request content before body parsing", () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-length": "2048" },
      body: "ok",
    });

    expect(() => assertRequestContentLengthUnderLimit(request, 1024)).toThrow(
      /Request body is too large/i,
    );
  });

  it("allows requests without an oversized content length", () => {
    const request = new Request("https://example.test/api", {
      method: "POST",
      headers: { "content-length": "512" },
      body: "ok",
    });

    expect(() =>
      assertRequestContentLengthUnderLimit(request, 1024),
    ).not.toThrow();
  });

  it("gates request logging to development mode", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    vi.stubEnv("NODE_ENV", "production");
    logRequest("Chat", { modelName: "model-a" });
    expect(logSpy).not.toHaveBeenCalled();

    vi.stubEnv("NODE_ENV", "development");
    logRequest("Chat", { modelName: "model-a" });
    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["JSON", withApiHandler],
    ["stream", withStreamApiHandler],
  ])("returns a quiet 499 when the %s wrapper is aborted", async (_, wrap) => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = wrap(async () => {
      const error = new Error("cancelled");
      error.name = "AbortError";
      throw error;
    });
    const request = new Request("https://example.test/api", {
      method: "POST",
      body: "{}",
    });

    const response = await handler(request as never);

    expect(response.status).toBe(499);
    expect(await response.text()).toBe("");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("preserves structured errors emitted by the stream wrapper", async () => {
    const handler = withStreamApiHandler(async () => {
      throw new ApiError("Typed failure", 422, "TYPED_FAILURE");
    });
    const response = await handler(
      new Request("https://example.test/api", {
        method: "POST",
        body: "{}",
      }) as never,
    );

    const payload = await response.text();
    expect(payload).toContain('"error":"Typed failure"');
    expect(payload).toContain('"code":"TYPED_FAILURE"');
    expect(payload).toContain('"statusCode":422');
  });
});
