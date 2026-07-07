import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Next middleware convention", () => {
  it("keeps Edge Middleware while Next proxy is Node-only and unsupported by OpenNext Cloudflare", () => {
    expect(existsSync(resolve(process.cwd(), "src/middleware.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/proxy.ts"))).toBe(false);
  });
});
