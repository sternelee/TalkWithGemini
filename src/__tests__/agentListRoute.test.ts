import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchJsonMock = vi.hoisted(() => vi.fn());
const safeServerLogWarnMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));

vi.mock("@/lib/security/safeFetch", () => ({
  safeFetchJson: safeFetchJsonMock,
}));

vi.mock("@/lib/security/urlPolicy", () => ({
  getSafeUrlPolicy: () => ({
    allowHttp: false,
    allowLocalHttp: false,
    allowLocalhost: false,
    allowPrivateNetwork: false,
  }),
}));

vi.mock("@/lib/market/agents", async () =>
  vi.importActual("../lib/market/agents"),
);

vi.mock("@/lib/market/agentLocale", async () =>
  vi.importActual("../lib/market/agentLocale"),
);

vi.mock("@/lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
  safeServerLogWarn: safeServerLogWarnMock,
}));

describe("agent list route", () => {
  beforeEach(() => {
    vi.resetModules();
    safeFetchJsonMock.mockReset();
    safeServerLogWarnMock.mockReset();
  });

  it("normalizes agents from the upstream registry", async () => {
    safeFetchJsonMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: {
        agents: [
          {
            identifier: "agent-1",
            meta: {
              title: " Agent One ",
              description: "Useful",
              tags: ["tools"],
            },
          },
          {
            identifier: "bad/agent",
            meta: { title: "Bad" },
          },
        ],
      },
    });

    const { GET } = await import("../app/api/agents/route");
    const response = await (GET as (request: Request) => Promise<Response>)(
      new Request("http://localhost/api/agents?locale=zh"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(safeFetchJsonMock).toHaveBeenCalledWith(
      "https://registry.npmmirror.com/@lobehub/agents-index/v1/files/public/index.zh-CN.json",
      { method: "GET" },
      expect.any(Object),
    );
    expect(body).toMatchObject({
      agents: [
        {
          identifier: "agent-1",
          meta: {
            title: "Agent One",
            description: "Useful",
            tags: ["tools"],
          },
        },
      ],
    });
  });

  it("uses the English upstream index for English locale requests", async () => {
    safeFetchJsonMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: { agents: [] },
    });

    const { GET } = await import("../app/api/agents/route");
    await (GET as (request: Request) => Promise<Response>)(
      new Request("http://localhost/api/agents?locale=en"),
    );

    expect(safeFetchJsonMock).toHaveBeenCalledWith(
      "https://registry.npmmirror.com/@lobehub/agents-index/v1/files/public/index.json",
      { method: "GET" },
      expect.any(Object),
    );
  });

  it("silently degrades when the upstream registry is unavailable", async () => {
    const error = new Error("Request timed out");
    safeFetchJsonMock.mockRejectedValue(error);

    const { GET } = await import("../app/api/agents/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ agents: [], unavailable: true });
    expect(safeServerLogWarnMock).toHaveBeenCalledWith(
      "Agent registry unavailable:",
      error,
    );
  });
});

describe("agent detail route", () => {
  beforeEach(() => {
    vi.resetModules();
    safeFetchJsonMock.mockReset();
    safeServerLogWarnMock.mockReset();
  });

  it("uses the Chinese localized detail file for Chinese locale requests", async () => {
    safeFetchJsonMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: {
        identifier: "agent-1",
        meta: { title: "中文助手" },
        config: { systemRole: "中文系统提示词" },
      },
    });

    const { GET } = await import("../app/api/agents/[identifier]/route");
    const response = await (GET as any)(
      new Request("http://localhost/api/agents/agent-1?locale=zh"),
      { params: Promise.resolve({ identifier: "agent-1" }) },
    );

    expect(response.status).toBe(200);
    expect(safeFetchJsonMock).toHaveBeenCalledWith(
      "https://registry.npmmirror.com/@lobehub/agents-index/v1/files/public/agent-1.zh-CN.json",
      { method: "GET" },
      expect.any(Object),
    );
  });

  it("uses the default detail file for English locale requests", async () => {
    safeFetchJsonMock.mockResolvedValue({
      response: new Response(null, { status: 200 }),
      data: {
        identifier: "agent-1",
        meta: { title: "English Agent" },
        config: { systemRole: "English system prompt" },
      },
    });

    const { GET } = await import("../app/api/agents/[identifier]/route");
    const response = await (GET as any)(
      new Request("http://localhost/api/agents/agent-1?locale=en"),
      { params: Promise.resolve({ identifier: "agent-1" }) },
    );

    expect(response.status).toBe(200);
    expect(safeFetchJsonMock).toHaveBeenCalledWith(
      "https://registry.npmmirror.com/@lobehub/agents-index/v1/files/public/agent-1.json",
      { method: "GET" },
      expect.any(Object),
    );
  });
});
