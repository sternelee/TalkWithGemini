import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  signedApiFetch: vi.fn(),
}));

vi.mock("@/store/core/settingsStore", () => ({
  useSettingsStore: {
    getState: mocks.getState,
  },
}));

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: mocks.signedApiFetch,
  };
});

vi.mock("../lib/byok/client", () => ({
  buildSearchRuntimeConfig: vi.fn(async () => ({})),
  fetchWithByokRetry: vi.fn((requestFactory) => requestFactory()),
}));

describe("search service", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.getState.mockReset();
    mocks.signedApiFetch.mockReset();
  });

  it("surfaces provider failures instead of returning empty successful results", async () => {
    mocks.getState.mockReturnValue({
      search: {
        provider: "firecrawl",
        configs: { firecrawl: {} },
        resultsLimit: 5,
      },
    });
    mocks.signedApiFetch.mockResolvedValue(
      Response.json({ error: "upstream unavailable" }, { status: 503 }),
    );

    const { createSearchProvider } =
      await import("../services/api/searchService");

    await expect(createSearchProvider({ query: "neo chat" })).rejects.toThrow(
      /Search request failed/i,
    );
  });
});
