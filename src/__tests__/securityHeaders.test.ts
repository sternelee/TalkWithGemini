import { describe, expect, it } from "vitest";
import { getSecurityHeaders } from "../lib/security/headers";

function getCspValue(mode: "local" | "hosted"): string {
  const csp = getSecurityHeaders(mode).find(
    (header) => header.key === "Content-Security-Policy",
  );
  expect(csp).toBeDefined();
  return csp?.value || "";
}

function getDirective(csp: string, directive: string): string {
  return (
    csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${directive} `)) || ""
  );
}

describe("security headers", () => {
  it("keeps local development CSP permissive enough for local proxies", () => {
    const csp = getCspValue("local");

    expect(getDirective(csp, "script-src")).toContain("'unsafe-eval'");
    expect(getDirective(csp, "img-src")).toContain("http:");
    expect(getDirective(csp, "connect-src")).toContain("http:");
  });

  it("removes broad http and unsafe-eval sources in hosted CSP", () => {
    const csp = getCspValue("hosted");

    expect(getDirective(csp, "script-src")).not.toContain("'unsafe-eval'");
    expect(getDirective(csp, "script-src")).not.toContain("'unsafe-inline'");
    expect(getDirective(csp, "script-src")).toContain("'sha256-");
    expect(getDirective(csp, "img-src")).not.toContain("http:");
    expect(getDirective(csp, "connect-src")).not.toContain("http:");
  });
});
