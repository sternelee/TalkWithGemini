import { beforeEach, describe, expect, it, vi } from "vitest";
import { MARKET_LIMITS } from "../config/limits";

const safeFetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchJson: safeFetchJsonMock,
}));

vi.mock("@/lib/security/urlPolicy", () => ({
  getSafeUrlPolicy: () => ({
    context: "pluginManifest",
    allowedProtocols: ["http:", "https:"],
  }),
}));

vi.mock("@/lib/market/plugins", async () => {
  return vi.importActual("../lib/market/plugins");
});

vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
  safeServerLogWarn: vi.fn(),
}));

vi.mock("@/config/limits", async () => {
  return vi.importActual("../config/limits");
});

const apiGuruPayload = {
  "good.example.com": {
    preferred: "v1",
    added: "2026-01-01",
    versions: {
      v1: {
        swaggerUrl: "https://example.com/openapi.json",
        info: {
          title: "Good",
          description: "Useful API",
          "x-apisguru-categories": ["tools"],
        },
      },
    },
  },
};

describe("plugin list route", () => {
  beforeEach(() => {
    vi.resetModules();
    safeFetchJsonMock.mockReset();
  });

  it("fetches APIs.guru with the plugin list response size limit", async () => {
    safeFetchJsonMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: apiGuruPayload,
    });

    const { GET } = await import("../app/api/plugins/list/route");
    const response = await GET();
    const body = await response.json();

    expect(safeFetchJsonMock).toHaveBeenCalledWith(
      "https://api.apis.guru/v2/list.json",
      { method: "GET" },
      expect.objectContaining({
        timeoutMs: 20_000,
        maxResponseBytes: MARKET_LIMITS.maxPluginListResponseBytes,
        policy: expect.objectContaining({
          allowedProtocols: ["https:"],
          allowedHosts: ["api.apis.guru"],
        }),
      }),
    );
    expect(body).toMatchObject({
      plugins: [
        {
          id: "good.example.com",
          title: "Good",
          manifestUrl: "https://example.com/openapi.json",
        },
      ],
    });
  });
});
