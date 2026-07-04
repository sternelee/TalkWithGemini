import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app viewport", () => {
  it("disables mobile page scaling", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    expect(layout).toContain("maximumScale: 1");
    expect(layout).toContain("userScalable: false");
  });
});
