import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);
vi.mock("@/lib/providers/providerTypes", async () =>
  vi.importActual("../lib/providers/providerTypes"),
);
vi.mock("@/lib/security/safeFetch", () => ({
  assertOutboundUrlAllowed: vi.fn(),
}));

describe("API helper provider credentials", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("does not use legacy provider environment variables as API key fallbacks", async () => {
    const { validateAndGetApiKey } = await import("../utils/apiHelpers");

    process.env.GEMINI_API_KEY = "gemini-env-secret";
    process.env.API_KEY = "api-env-secret";
    process.env.OPENAI_API_KEY = "openai-env-secret";

    expect(() => validateAndGetApiKey({ type: "Gemini" })).toThrow(
      /API key is not configured/,
    );
    expect(() => validateAndGetApiKey({ type: "OpenAI" })).toThrow(
      /API key is not configured/,
    );
    expect(() => validateAndGetApiKey({ type: "OpenAI Compatible" })).toThrow(
      /API key is not configured/,
    );
  });
});
