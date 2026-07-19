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

  it("keeps original-file recovery separate from extracted-text editing", () => {
    const knowledgeBase = readFileSync(
      resolve(process.cwd(), "src/components/knowledge/KnowledgeBase.tsx"),
      "utf8",
    );

    expect(knowledgeBase).toContain("getStorageDisplayStatus");
    expect(knowledgeBase).toContain("getIndexDisplayStatus");
    expect(knowledgeBase).toContain("file.contentPath || file.path");
    expect(knowledgeBase).toContain("handleDownloadOriginal");
    expect(knowledgeBase).toContain("reparseFile(");
    expect(knowledgeBase).toContain("selectOriginalAria");
  });

  it("supports locating a collection and file from global search", () => {
    const knowledgeBase = readFileSync(
      resolve(process.cwd(), "src/components/knowledge/KnowledgeBase.tsx"),
      "utf8",
    );

    expect(knowledgeBase).toContain("initialCollectionId?: string");
    expect(knowledgeBase).toContain("initialFileId?: string");
    expect(knowledgeBase).toContain("data-knowledge-file-id={file.id}");
    expect(knowledgeBase).toContain("scrollIntoView({");
    expect(knowledgeBase).toContain("setHighlightedFileId");
  });
});
