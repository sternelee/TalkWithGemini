import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Next middleware convention", () => {
  it("keeps the Edge Middleware convention required by OpenNext Cloudflare", () => {
    expect(existsSync(resolve(process.cwd(), "src/middleware.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/proxy.ts"))).toBe(false);
  });
});
