import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearApiProofSessionCache,
  getResponseErrorMessage,
  readJsonResponse,
  readJsonResponseOrThrow,
  signedApiFetch,
} from "../lib/api/client";

describe("client API response helpers", () => {
  afterEach(() => {
    clearApiProofSessionCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("parses JSON responses and returns null for empty or malformed bodies", async () => {
    await expect(
      readJsonResponse<{ ok: boolean }>(Response.json({ ok: true })),
    ).resolves.toEqual({ ok: true });
    await expect(readJsonResponse(new Response(""))).resolves.toBeNull();
    await expect(
      readJsonResponse(new Response("<html>Proxy error</html>")),
    ).resolves.toBeNull();
  });

  it("throws a stable fallback when successful response JSON is malformed", async () => {
    await expect(
      readJsonResponseOrThrow(new Response("<html></html>"), "Bad response"),
    ).rejects.toThrow("Bad response");
  });

  it("extracts public error messages with a stable fallback", async () => {
    await expect(
      getResponseErrorMessage(Response.json({ error: "Nope" }), "Fallback"),
    ).resolves.toBe("Nope");
    await expect(
      getResponseErrorMessage(
        Response.json({ error: { message: "Nested nope" } }),
        "Fallback",
      ),
    ).resolves.toBe("Nested nope");
    await expect(
      getResponseErrorMessage(new Response("<html></html>"), "Fallback"),
    ).resolves.toBe("Fallback");
  });

  it("signs protected API requests with a cached request proof session", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
          if (String(input) === "/api/request-proof/session") {
            return Response.json({
              enabled: true,
              clientKey: "dGVzdC1jbGllbnQtcHJvb2Yta2V5",
              expiresAt: Date.now() + 600_000,
              serverTime: Date.now(),
              windowMs: 60_000,
            });
          }

          return Response.json({
            ok: true,
            headers: Object.fromEntries(new Headers(init?.headers).entries()),
            body: init?.body,
            signal: init?.signal ? "present" : "missing",
          });
        },
      );
    const controller = new AbortController();

    const response = await signedApiFetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
      signal: controller.signal,
    });
    const data = await response.json();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(data.headers["content-type"]).toBe("application/json");
    expect(data.headers["x-neo-api-proof-timestamp"]).toBeTruthy();
    expect(data.headers["x-neo-api-proof-nonce"]).toBeTruthy();
    expect(data.headers["x-neo-api-proof-signature"]).toBeTruthy();
    expect(data.body).toBe(JSON.stringify({ ok: true }));
    expect(data.signal).toBe("present");

    await signedApiFetch("/api/search", { method: "POST" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does not add proof headers when the server reports proof disabled", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/request-proof/session") {
          return Response.json({
            enabled: false,
            serverTime: Date.now(),
          });
        }

        return Response.json({
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
        });
      },
    );

    const response = await signedApiFetch("/api/chat", { method: "POST" });
    const data = await response.json();

    expect(data.headers["x-neo-api-proof-signature"]).toBeUndefined();
  });

  it("stops waiting for the shared proof handshake when its caller aborts", async () => {
    let resolveSession!: (response: Response) => void;
    const sessionResponse = new Promise<Response>((resolve) => {
      resolveSession = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL) => {
        if (String(input) === "/api/request-proof/session") {
          return sessionResponse;
        }
        return Response.json({ ok: true });
      });
    const controller = new AbortController();

    const request = signedApiFetch("/api/chat", {
      method: "POST",
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveSession(Response.json({ enabled: false, serverTime: Date.now() }));
    await Promise.resolve();
  });

  it("reports the proof handshake watchdog as a timeout, not caller cancellation", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    });

    const request = signedApiFetch("/api/chat", { method: "POST" });
    const expectation = expect(request).rejects.toMatchObject({
      name: "ResponseTimeoutError",
      code: "RESPONSE_TIMEOUT",
      statusCode: 504,
    });
    await vi.advanceTimersByTimeAsync(30_000);

    await expectation;
  });
});
