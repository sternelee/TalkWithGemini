import { afterEach, describe, expect, it, vi } from "vitest";

const storeState = vi.hoisted(() => ({
  value: {
    marketAgents: [] as any[],
    marketAgentsTimestamp: 0,
    marketAgentsLocale: "",
    setMarketAgents: vi.fn(),
  },
}));

vi.mock("@/store/core/settingsStore", () => ({
  useSettingsStore: {
    getState: vi.fn(() => storeState.value),
  },
}));

describe("agent service", () => {
  afterEach(() => {
    storeState.value = {
      marketAgents: [],
      marketAgentsTimestamp: 0,
      marketAgentsLocale: "",
      setMarketAgents: vi.fn(),
    };
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uses cached agents for 72 hours", async () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const cachedAgent = {
      identifier: "agent-1",
      meta: {
        avatar: "bot",
        title: "Cached",
        description: "Cached agent",
        tags: [],
        category: "General",
      },
      createdAt: "",
      homepage: "",
      author: "",
    };
    storeState.value = {
      marketAgents: [cachedAgent],
      marketAgentsTimestamp: now - 72 * 60 * 60 * 1000 + 1,
      marketAgentsLocale: "en",
      setMarketAgents: vi.fn(),
    };
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network should not be used"));
    const { getAgents } = await import("../services/api/agentService");

    await expect(getAgents()).resolves.toEqual([cachedAgent]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes agents after the 72 hour cache window", async () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [
        {
          identifier: "stale",
          meta: {
            avatar: "bot",
            title: "Stale",
            description: "Stale agent",
            tags: [],
            category: "General",
          },
          createdAt: "",
          homepage: "",
          author: "",
        },
      ],
      marketAgentsTimestamp: now - 72 * 60 * 60 * 1000 - 1,
      marketAgentsLocale: "en",
      setMarketAgents,
    };
    const freshAgent = {
      identifier: "fresh",
      meta: {
        avatar: "bot",
        title: "Fresh",
        description: "Fresh agent",
        tags: [],
        category: "General",
      },
      createdAt: "",
      homepage: "",
      author: "",
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ agents: [freshAgent] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { getAgents } = await import("../services/api/agentService");

    await expect(getAgents()).resolves.toEqual([freshAgent]);
    expect(setMarketAgents).toHaveBeenCalledWith([freshAgent], "en");
  });

  it("does not reuse cached agents from a different locale", async () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const cachedAgent = {
      identifier: "cached-en",
      meta: {
        avatar: "bot",
        title: "Cached English",
        description: "Cached English agent",
        tags: [],
        category: "General",
      },
      createdAt: "",
      homepage: "",
      author: "",
    };
    const zhAgent = {
      identifier: "fresh-zh",
      meta: {
        avatar: "bot",
        title: "中文助手",
        description: "中文市场助手",
        tags: [],
        category: "General",
      },
      createdAt: "",
      homepage: "",
      author: "",
    };
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [cachedAgent],
      marketAgentsTimestamp: now - 1,
      marketAgentsLocale: "en",
      setMarketAgents,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ agents: [zhAgent] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { getAgents } = await import("../services/api/agentService");

    await expect(getAgents(false, "zh")).resolves.toEqual([zhAgent]);
    expect(fetchMock).toHaveBeenCalledWith("/api/agents?locale=zh");
    expect(setMarketAgents).toHaveBeenCalledWith([zhAgent], "zh");
  });

  it("uses stale cache without overwriting it when the agent registry is unavailable", async () => {
    const now = Date.UTC(2026, 0, 1);
    vi.spyOn(Date, "now").mockReturnValue(now);
    const staleAgent = {
      identifier: "stale",
      meta: {
        avatar: "bot",
        title: "Stale",
        description: "Stale agent",
        tags: [],
        category: "General",
      },
      createdAt: "",
      homepage: "",
      author: "",
    };
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [staleAgent],
      marketAgentsTimestamp: now - 72 * 60 * 60 * 1000 - 1,
      marketAgentsLocale: "en",
      setMarketAgents,
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ agents: [], unavailable: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { getAgents } = await import("../services/api/agentService");

    await expect(getAgents()).resolves.toEqual([staleAgent]);
    expect(setMarketAgents).not.toHaveBeenCalled();
  });

  it("reuses an in-flight agent list request", async () => {
    const freshAgent = {
      identifier: "fresh",
      meta: {
        avatar: "bot",
        title: "Fresh",
        description: "Fresh agent",
        tags: [],
        category: "General",
      },
      createdAt: "",
      homepage: "",
      author: "",
    };
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [],
      marketAgentsTimestamp: 0,
      marketAgentsLocale: "",
      setMarketAgents,
    };
    let resolveFetch!: (response: Response) => void;
    const fetchPromise = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockReturnValue(fetchPromise);
    const { getAgents } = await import("../services/api/agentService");

    const firstRequest = getAgents();
    const secondRequest = getAgents();
    resolveFetch(
      new Response(JSON.stringify({ agents: [freshAgent] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(Promise.all([firstRequest, secondRequest])).resolves.toEqual([
      [freshAgent],
      [freshAgent],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(setMarketAgents).toHaveBeenCalledTimes(1);
  });

  it("keeps in-flight agent list requests separated by locale", async () => {
    const setMarketAgents = vi.fn();
    storeState.value = {
      marketAgents: [],
      marketAgentsTimestamp: 0,
      marketAgentsLocale: "",
      setMarketAgents,
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((url) =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            agents: [
              {
                identifier: String(url).includes("locale=zh") ? "zh" : "en",
                meta: { title: String(url) },
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        ),
      ),
    );
    const { getAgents } = await import("../services/api/agentService");

    await expect(
      Promise.all([getAgents(false, "en"), getAgents(false, "zh")]),
    ).resolves.toEqual([
      [expect.objectContaining({ identifier: "en" })],
      [expect.objectContaining({ identifier: "zh" })],
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/agents?locale=en");
    expect(fetchMock).toHaveBeenCalledWith("/api/agents?locale=zh");
  });

  it("encodes agent detail identifiers before building the local API path", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ identifier: "team/agent?x=1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { getAgentDetail } = await import("../services/api/agentService");

    await expect(getAgentDetail("team/agent?x=1")).rejects.toThrow(
      "Invalid agent detail response",
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/agents/team%2Fagent%3Fx%3D1?locale=en",
    );
  });

  it("passes the requested locale when fetching agent details", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ identifier: "agent-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const { getAgentDetail } = await import("../services/api/agentService");

    await getAgentDetail("agent-1", "zh");

    expect(fetchMock).toHaveBeenCalledWith("/api/agents/agent-1?locale=zh");
  });

  it("normalizes agent detail responses at the client boundary", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          identifier: "different",
          meta: { title: " Detail " },
          config: { systemRole: "Role" },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );
    const { getAgentDetail } = await import("../services/api/agentService");

    await expect(getAgentDetail("agent-1")).resolves.toMatchObject({
      identifier: "agent-1",
      meta: { title: "Detail", systemRole: "Role" },
      config: { systemRole: "Role" },
    });
  });
});
