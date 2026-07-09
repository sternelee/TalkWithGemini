import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("MCP client transport safety", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("allows HTTPS MCP servers on private network addresses", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const { createSafeMcpFetch } = await import("../lib/mcp/client");
    const safeFetch = createSafeMcpFetch({ maxResponseBytes: 64 });
    const response = await safeFetch("https://192.168.1.10/mcp");

    await expect(response.text()).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://192.168.1.10/mcp",
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("keeps plain HTTP blocked even for private MCP servers", async () => {
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const { createSafeMcpFetch } = await import("../lib/mcp/client");
    const safeFetch = createSafeMcpFetch();

    await expect(safeFetch("http://192.168.1.10/mcp")).rejects.toThrow(
      /Protocol|HTTP/i,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("follows validated MCP redirects manually", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 307,
          headers: { location: "/mcp/" },
        }),
      )
      .mockResolvedValueOnce(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const { createSafeMcpFetch } = await import("../lib/mcp/client");
    const safeFetch = createSafeMcpFetch();
    const response = await safeFetch("https://93.184.216.34/mcp");

    await expect(response.text()).resolves.toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://93.184.216.34/mcp/",
    );
    expect(fetchMock.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ redirect: "manual" }),
    );
  });

  it("rejects unsafe MCP redirects before the SDK follows them", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://93.184.216.34/mcp" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createSafeMcpFetch } = await import("../lib/mcp/client");
    const safeFetch = createSafeMcpFetch();

    await expect(safeFetch("https://93.184.216.34/mcp")).rejects.toThrow(
      /Protocol|HTTP/i,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://93.184.216.34/mcp",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("limits MCP response bodies before the SDK parses them", async () => {
    const encoder = new TextEncoder();
    const fetchMock = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(encoder.encode("012345"));
              controller.enqueue(encoder.encode("6789"));
              controller.close();
            },
          }),
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createSafeMcpFetch } = await import("../lib/mcp/client");
    const safeFetch = createSafeMcpFetch({ maxResponseBytes: 8 });
    const response = await safeFetch("https://93.184.216.34/mcp");

    await expect(response.text()).rejects.toThrow(/too large/i);
  });
});
