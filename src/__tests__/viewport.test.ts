import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("app viewport", () => {
  it("allows mobile users to pinch zoom", () => {
    const layout = readFileSync(
      resolve(process.cwd(), "src/app/layout.tsx"),
      "utf8",
    );

    expect(layout).not.toContain("maximumScale");
    expect(layout).not.toContain("userScalable: false");
  });
});
