import { beforeEach, describe, expect, it, vi } from "vitest";

const safeFetchJsonMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/middleware", async () =>
  vi.importActual("../lib/api/middleware"),
);

vi.mock("../lib/security/safeFetch", () => ({
  safeFetchJson: safeFetchJsonMock,
}));

vi.mock("../lib/security/urlPolicy", async () =>
  vi.importActual("../lib/security/urlPolicy"),
);

vi.mock("../lib/utils/safeServerLog", () => ({
  safeServerLogError: vi.fn(),
}));

describe("MCP servers route", () => {
  beforeEach(() => {
    vi.resetModules();
    safeFetchJsonMock.mockReset();
  });

  it("passes cursor, search, and latest-version filtering to the MCP registry", async () => {
    safeFetchJsonMock.mockResolvedValue({
      response: { ok: true },
      data: {
        servers: [
          {
            name: "io.github/context7",
            version: "1.2.3",
            description: "Context-aware docs lookup.",
            remotes: [
              {
                type: "streamable-http",
                url: "https://mcp.example.com/mcp",
              },
            ],
          },
        ],
        metadata: { nextCursor: "next-cursor" },
      },
    });

    const { GET } = await import("../app/api/mcp/servers/route");
    const response = await GET(
      new Request(
        "http://localhost/api/mcp/servers?cursor=start-cursor&search=context&limit=1",
      ) as any,
    );

    expect(response.status).toBe(200);
    const registryUrl = new URL(safeFetchJsonMock.mock.calls[0][0]);
    expect(registryUrl.searchParams.get("cursor")).toBe("start-cursor");
    expect(registryUrl.searchParams.get("search")).toBe("context");
    expect(registryUrl.searchParams.get("version")).toBe("latest");
    expect(registryUrl.searchParams.get("limit")).toBe("100");
    await expect(response.json()).resolves.toMatchObject({
      nextCursor: "next-cursor",
      plugins: [
        {
          source: "mcp",
          title: "io.github/context7",
        },
      ],
    });
  });

  it("continues through sparse registry pages until it fills the requested plugin page", async () => {
    safeFetchJsonMock
      .mockResolvedValueOnce({
        response: { ok: true },
        data: {
          servers: [
            {
              name: "local-only",
              version: "1.0.0",
              packages: [{ registryType: "npm", identifier: "local-only" }],
            },
          ],
          metadata: { nextCursor: "after-empty" },
        },
      })
      .mockResolvedValueOnce({
        response: { ok: true },
        data: {
          servers: [
            {
              name: "remote-docs",
              version: "1.0.0",
              remotes: [
                {
                  type: "streamable-http",
                  url: "https://mcp.example.com/mcp",
                },
              ],
            },
          ],
          metadata: { nextCursor: "after-remote" },
        },
      });

    const { GET } = await import("../app/api/mcp/servers/route");
    const response = await GET(
      new Request("http://localhost/api/mcp/servers?limit=1") as any,
    );

    expect(response.status).toBe(200);
    expect(safeFetchJsonMock).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toMatchObject({
      nextCursor: "after-remote",
      plugins: [{ title: "remote-docs" }],
    });
  });
});
