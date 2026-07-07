import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  API_PROOF_ERROR_CODES,
  API_PROOF_SESSION_COOKIE,
  createRequestProofHeaders,
  createRequestProofSession,
  clearRequestProofSigningKeyForTesting,
} from "../lib/security/requestProof";
import {
  MemoryRateLimitStore,
  setRateLimitStoreForTesting,
} from "../lib/security/rateLimitStore";
import { middleware as proxy } from "../middleware";

function hostedEnv(privateKey = "stable-proof-private-key") {
  vi.stubEnv("DEPLOYMENT_MODE", "hosted");
  vi.stubEnv("ACCESS_PASSWORD", "");
  vi.stubEnv("BYOK_PRIVATE_KEY_PEM", privateKey);
  setRateLimitStoreForTesting(new MemoryRateLimitStore());
}

function protectedRequest(
  headers: Record<string, string> = {},
  path = "/api/chat",
) {
  return new NextRequest(`https://neo.test${path}`, {
    method: "POST",
    headers: {
      origin: "https://neo.test",
      ...headers,
    },
  });
}

describe("API request proof middleware", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    setRateLimitStoreForTesting(null);
    clearRequestProofSigningKeyForTesting();
  });

  it("rejects hosted protected API requests without request proof", async () => {
    hostedEnv();

    const response = await proxy(protectedRequest());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toMatchObject({
      code: API_PROOF_ERROR_CODES.required,
      statusCode: 401,
    });
  });

  it("fails closed for hosted protected API requests when BYOK is missing", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "hosted");
    vi.stubEnv("ACCESS_PASSWORD", "");
    vi.stubEnv("BYOK_PRIVATE_KEY_PEM", "");

    const response = await proxy(protectedRequest());
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data).toMatchObject({
      code: API_PROOF_ERROR_CODES.notConfigured,
      statusCode: 503,
    });
  });

  it("allows hosted protected API requests with valid request proof", async () => {
    hostedEnv();
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const session = await createRequestProofSession(now);
    const proofHeaders = await createRequestProofHeaders({
      clientKey: session.clientKey,
      method: "POST",
      target: "/api/chat",
      timestamp: now,
      nonce: "nonce-valid",
    });

    const response = await proxy(
      protectedRequest({
        cookie: `${API_PROOF_SESSION_COOKIE}=${session.cookieValue}`,
        ...proofHeaders,
      }),
    );

    expect(response.status).toBe(200);
  });

  it("rejects replayed request proof nonces within the proof window", async () => {
    hostedEnv();
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const session = await createRequestProofSession(now);
    const proofHeaders = await createRequestProofHeaders({
      clientKey: session.clientKey,
      method: "POST",
      target: "/api/chat",
      timestamp: now,
      nonce: "nonce-replayed",
    });

    const firstResponse = await proxy(
      protectedRequest({
        cookie: `${API_PROOF_SESSION_COOKIE}=${session.cookieValue}`,
        ...proofHeaders,
      }),
    );
    const replayResponse = await proxy(
      protectedRequest({
        cookie: `${API_PROOF_SESSION_COOKIE}=${session.cookieValue}`,
        ...proofHeaders,
      }),
    );
    const data = await replayResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(replayResponse.status).toBe(401);
    expect(data).toMatchObject({
      code: API_PROOF_ERROR_CODES.invalid,
      statusCode: 401,
    });
  });

  it("rejects hosted protected API requests with expired request proof", async () => {
    hostedEnv();
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);
    const session = await createRequestProofSession(now);
    const proofHeaders = await createRequestProofHeaders({
      clientKey: session.clientKey,
      method: "POST",
      target: "/api/chat",
      timestamp: now - 61_000,
      nonce: "nonce-expired",
    });

    const response = await proxy(
      protectedRequest({
        cookie: `${API_PROOF_SESSION_COOKIE}=${session.cookieValue}`,
        ...proofHeaders,
      }),
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data).toMatchObject({
      code: API_PROOF_ERROR_CODES.expired,
      statusCode: 401,
    });
  });

  it("does not require request proof for local mode or public bootstrap APIs", async () => {
    vi.stubEnv("DEPLOYMENT_MODE", "local");
    vi.stubEnv("ACCESS_PASSWORD", "");

    await expect(proxy(protectedRequest())).resolves.toMatchObject({
      status: 200,
    });

    hostedEnv();
    await expect(
      proxy(new NextRequest("https://neo.test/api/config")),
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      proxy(new NextRequest("https://neo.test/api/request-proof/session")),
    ).resolves.toMatchObject({ status: 200 });
  });
});
