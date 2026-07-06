import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app viewport", () => {
  it("locks mobile viewport zoom while keeping device-width layout", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    expect(layout).toContain('width: "device-width"');
    expect(layout).toContain("initialScale: 1");
    expect(layout).toContain("maximumScale: 1");
    expect(layout).toContain("userScalable: false");
  });
});
