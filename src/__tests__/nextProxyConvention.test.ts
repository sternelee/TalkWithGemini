import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Next proxy convention", () => {
  it("uses the Next 16 proxy file convention instead of middleware", () => {
    expect(existsSync(resolve(process.cwd(), "src/proxy.ts"))).toBe(true);
    expect(existsSync(resolve(process.cwd(), "src/middleware.ts"))).toBe(false);
  });
});
