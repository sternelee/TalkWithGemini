import { afterEach, describe, expect, it, vi } from "vitest";
import { getSafeUrlPolicy } from "../lib/security/urlPolicy";

vi.mock("server-only", () => ({}));

function mockWorkerDns({
  ipv4 = [],
  ipv6 = [],
}: {
  ipv4?: string[];
  ipv6?: string[];
}) {
  const lookup = vi.fn(async () => {
    throw new Error("Not implemented");
  });
  const resolve4 = vi.fn(async () => ipv4);
  const resolve6 = vi.fn(async () => ipv6);

  vi.doMock("node:dns/promises", () => ({
    lookup,
    resolve4,
    resolve6,
  }));

  return { lookup, resolve4, resolve6 };
}

describe("safeFetch Worker DNS compatibility", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("node:dns/promises");
    vi.resetModules();
  });

  it("uses resolve4 and resolve6 when dns.lookup is unavailable", async () => {
    vi.resetModules();
    const dns = mockWorkerDns({ ipv4: ["93.184.216.34"] });
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ ok: true }),
    );
    const { safeFetch } = await import("../lib/security/safeFetch");

    await expect(
      safeFetch(
        "https://example.com/openapi.json",
        { method: "GET" },
        { policy: getSafeUrlPolicy("plugin") },
      ),
    ).resolves.toBeInstanceOf(Response);

    expect(dns.lookup).toHaveBeenCalledWith("example.com", {
      all: true,
      verbatim: true,
    });
    expect(dns.resolve4).toHaveBeenCalledWith("example.com");
    expect(dns.resolve6).toHaveBeenCalledWith("example.com");
  });

  it("still blocks private addresses resolved through Worker DNS", async () => {
    vi.resetModules();
    mockWorkerDns({ ipv4: ["127.0.0.1"] });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { safeFetch } = await import("../lib/security/safeFetch");

    await expect(
      safeFetch(
        "https://example.com/openapi.json",
        { method: "GET" },
        { policy: getSafeUrlPolicy("plugin") },
      ),
    ).rejects.toThrow(/Private network/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
