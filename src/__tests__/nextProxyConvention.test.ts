import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Next middleware convention", () => {
  it("keeps Edge Middleware while Next proxy is Node-only and unsupported by OpenNext Cloudflare", () => {
    expect(existsSync(resolve(process.cwd(), "src/middleware.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/proxy.ts"))).toBe(false);
  });

  it("documents middleware as an OpenNext Cloudflare compatibility requirement", () => {
    const deploymentGuide = readFileSync(
      resolve(process.cwd(), "docs/deployment-hardening.md"),
      "utf8",
    );

    expect(deploymentGuide).toContain("`src/middleware.ts`");
    expect(deploymentGuide).toContain("OpenNext Cloudflare compatibility");
    expect(deploymentGuide).toContain("Do not rename it to `src/proxy.ts`");
  });
});
