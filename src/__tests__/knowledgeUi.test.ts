import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("knowledge UI composition", () => {
  it("renders knowledge statuses and dates through localized app UI", () => {
    const knowledgeBase = readFileSync(
      resolve(process.cwd(), "src/components/knowledge/KnowledgeBase.tsx"),
      "utf8",
    );
    const selectionModal = readFileSync(
      resolve(
        process.cwd(),
        "src/components/knowledge/KnowledgeSelectionModal.tsx",
      ),
      "utf8",
    );

    expect(knowledgeBase).toContain("useLocale");
    expect(knowledgeBase).toContain("Intl.DateTimeFormat(locale)");
    expect(knowledgeBase).not.toContain("toLocaleDateString()");
    expect(selectionModal).toContain("getKnowledgeStatusLabelKey");
    expect(selectionModal).toContain(
      "t(getKnowledgeStatusLabelKey(file.status))",
    );
    expect(selectionModal).not.toContain("{file.status}");
  });
});
