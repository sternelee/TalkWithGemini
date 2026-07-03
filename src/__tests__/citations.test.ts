import { describe, expect, it } from "vitest";
import {
  createCitationHref,
  linkifyCitationReferences,
} from "../lib/utils/citations";
import type { Source } from "../types";

describe("citation utilities", () => {
  it("creates internal citation hrefs", () => {
    expect(createCitationHref(2)).toBe("#citation-2");
  });

  it("linkifies citation references without interpolating raw source URLs", () => {
    const sources: Source[] = [
      {
        title: "Unsafe",
        url: "https://example.com/a) injected [x](javascript:alert(1)",
        content: "content",
      },
    ];

    const output = linkifyCitationReferences(
      "Use [1], but keep `[1]` as code.",
      sources,
    );

    expect(output).toBe("Use [1](#citation-0), but keep `[1]` as code.");
    expect(output).not.toContain("example.com");
    expect(output).not.toContain("javascript:");
  });

  it("leaves missing citation references untouched", () => {
    expect(linkifyCitationReferences("Use [2].", [])).toBe("Use [2].");
  });
});
