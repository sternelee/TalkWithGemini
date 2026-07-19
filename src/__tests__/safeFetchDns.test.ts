import { afterEach, describe, expect, it, vi } from "vitest";
import { getSafeUrlPolicy } from "../lib/security/urlPolicy";
import { safeFetchText } from "../lib/security/safeFetch";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({
  lookup: lookupMock,
}));

describe("safe fetch DNS timeout", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    lookupMock.mockReset();
  });

  it("times out stalled DNS resolution before fetch dispatch", async () => {
    vi.useFakeTimers();
    lookupMock.mockReturnValue(new Promise(() => {}));
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const result = safeFetchText(
      "https://example.com/openapi.json",
      { method: "GET" },
      { policy: getSafeUrlPolicy("plugin"), timeoutMs: 25 },
    );
    const expectation = expect(result).rejects.toMatchObject({
      name: "ResponseTimeoutError",
      code: "RESPONSE_TIMEOUT",
    });

    await vi.advanceTimersByTimeAsync(25);

    await expectation;
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("revalidates DNS before dispatch without blocking private or Fake-IP results", async () => {
    lookupMock
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "198.18.0.1", family: 4 }]);
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ ok: true }));

    await expect(
      safeFetchText(
        "https://registry.npmmirror.com/agents.json",
        { method: "GET" },
        { policy: getSafeUrlPolicy("agent"), timeoutMs: 1_000 },
      ),
    ).resolves.toMatchObject({ text: '{"ok":true}' });

    expect(lookupMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
