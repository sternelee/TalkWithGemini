import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Plugin } from "../types";

const storeMock = vi.hoisted(() => ({
  state: {} as {
    marketPlugins: Plugin[];
    marketPluginsTimestamp: number;
    setMarketPlugins: ReturnType<typeof vi.fn>;
  },
}));

vi.mock("@/store/core/settingsStore", () => ({
  useSettingsStore: {
    getState: () => storeMock.state,
  },
}));

vi.mock("../lib/utils/devLogger", () => ({
  logDevError: vi.fn(),
  logDevInfo: vi.fn(),
  logDevWarn: vi.fn(),
}));

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
    ),
  };
});

const pluginA: Plugin = {
  id: "example.com:alpha",
  title: "Alpha",
  description: "Alpha plugin",
  logoUrl: "",
  manifestUrl: "https://example.com/alpha.json",
  functions: [],
};

const pluginB: Plugin = {
  id: "example.com:beta",
  title: "Beta",
  description: "Beta plugin",
  logoUrl: "",
  manifestUrl: "https://example.com/beta.json",
  functions: [],
};

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

function getFetchCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls as Array<[RequestInfo | URL, RequestInit?]>;
}

describe("plugin market service cache", () => {
  beforeEach(() => {
    vi.resetModules();
    storeMock.state = {
      marketPlugins: [],
      marketPluginsTimestamp: 0,
      setMarketPlugins: vi.fn((plugins: Plugin[]) => {
        storeMock.state.marketPlugins = plugins;
        storeMock.state.marketPluginsTimestamp = Date.now();
      }),
    };
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns valid cached plugins without fetching", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList();

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginA);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps cached plugins fresh for 72 hours", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now() - 48 * 60 * 60 * 1000;
    const fetchMock = vi.fn(async () => jsonResponse({ plugins: [pluginB] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList();

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginA);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes cached plugins after 72 hours", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now() - 73 * 60 * 60 * 1000;
    const fetchMock = vi.fn(async () => jsonResponse({ plugins: [pluginB] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList();

    expect(getFetchCalls(fetchMock)[0]?.[0]).toBe("/api/plugins/list");
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginB);
  });

  it("force refresh bypasses cache and stores fresh plugins", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now();
    const fetchMock = vi.fn(async () => jsonResponse({ plugins: [pluginB] }));
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList(true);

    expect(getFetchCalls(fetchMock)[0]?.[0]).toBe("/api/plugins/list");
    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginB);
    expect(storeMock.state.setMarketPlugins).toHaveBeenCalledWith([
      expect.objectContaining(pluginB),
    ]);
  });

  it("falls back to stale cache when refreshing fails", async () => {
    storeMock.state.marketPlugins = [pluginA];
    storeMock.state.marketPluginsTimestamp = Date.now() - 25 * 60 * 60 * 1000;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ error: "failed" }, { status: 500 })),
    );

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const plugins = await fetchApiGuruList();

    expect(plugins).toHaveLength(1);
    expect(plugins[0]).toMatchObject(pluginA);
  });

  it("reuses an in-flight plugin list request", async () => {
    let resolveFetch: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { fetchApiGuruList } = await import("../services/api/pluginService");
    const first = fetchApiGuruList();
    const second = fetchApiGuruList();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch?.(jsonResponse({ plugins: [pluginA] }));

    await expect(first).resolves.toEqual([expect.objectContaining(pluginA)]);
    await expect(second).resolves.toEqual([expect.objectContaining(pluginA)]);
  });
});
