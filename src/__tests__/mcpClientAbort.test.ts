import { afterEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

describe("MCP client cancellation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    lookupMock.mockReset();
  });

  it("cancels DNS preflight with the transport request signal", async () => {
    lookupMock.mockReturnValue(new Promise(() => {}));
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const controller = new AbortController();
    const { createSafeMcpFetch } = await import("../lib/mcp/client");
    const safeFetch = createSafeMcpFetch();

    const request = safeFetch("https://example.com/mcp", {
      signal: controller.signal,
    });
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
