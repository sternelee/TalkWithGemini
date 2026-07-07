import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("locale client boundary", () => {
  it("keeps the client locale setter away from server request config", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/i18n/useSetLocale.ts"),
      "utf8",
    );

    expect(source).not.toContain('from "./request"');
    expect(source).toContain('from "./constants"');
  });
});
