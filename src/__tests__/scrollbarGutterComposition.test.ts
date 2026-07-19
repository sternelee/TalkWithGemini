import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("stable scrollbar gutter composition", () => {
  it("covers app-owned vertical and bidirectional scroll containers", () => {
    const globals = readProjectFile("src/app/globals.css");
    const gutterRule = globals.match(
      /:where\(([\s\S]*?)\)\s*\{\s*@apply scrollbar-gutter-both;\s*\}/,
    );

    expect(gutterRule).not.toBeNull();
    for (const selector of [
      "html",
      "textarea",
      ".overflow-y-auto",
      ".overflow-auto",
      ".overflow-y-scroll",
      ".overflow-scroll",
      ".markdown-diagram-svg",
    ]) {
      expect(gutterRule?.[1]).toContain(selector);
    }

    expect(globals).not.toContain(".scrollbar-overlay");
    expect(globals).not.toMatch(/overflow(?:-y)?:\s*overlay/);
  });

  it("uses reduced padding only on the primary scrolling content", () => {
    const chatShell = readProjectFile("src/components/app/ChatAppShell.tsx");
    const globalSearch = readProjectFile(
      "src/components/search/GlobalSearchCenter.tsx",
    );
    const assistantHub = readProjectFile(
      "src/components/assistant/AssistantHub.tsx",
    );
    const skillMarket = readProjectFile("src/components/skill/SkillMarket.tsx");
    const pluginMarket = readProjectFile(
      "src/components/plugin/PluginMarket.tsx",
    );
    const knowledgeBase = readProjectFile(
      "src/components/knowledge/KnowledgeBase.tsx",
    );
    const settingsPage = readProjectFile(
      "src/components/settings/SettingsPage.tsx",
    );

    expect(chatShell).toContain(
      "flex-1 overflow-y-auto px-3 pb-[calc(8rem+env(safe-area-inset-bottom))]",
    );
    expect(chatShell).toContain("md:px-6 md:pt-6");
    expect(chatShell).toContain(
      "absolute left-0 right-0 z-20 px-4 pointer-events-none md:px-8",
    );
    expect(chatShell).not.toContain("scrollbar-overlay");

    expect(globalSearch).toContain(
      "min-h-0 flex-1 overflow-y-auto scrollbar-gutter-both px-3 py-5 md:px-6",
    );
    expect(globalSearch).toContain(
      'header className="border-b border-border px-4 py-4 md:px-8"',
    );

    expect(assistantHub).toContain(
      "flex-1 overflow-y-auto px-4 pb-10 custom-scrollbar",
    );
    expect(skillMarket).toContain(
      "flex-1 overflow-y-auto px-4 pb-10 custom-scrollbar",
    );
    expect(pluginMarket).toContain(
      "flex-1 overflow-y-auto px-4 pb-10 custom-scrollbar",
    );
    expect(knowledgeBase).toContain(
      "flex-1 overflow-y-auto px-4 ${activeCollection",
    );

    expect(settingsPage).toContain(
      "md:overflow-y-auto md:scrollbar-gutter-both",
    );
    expect(settingsPage).toContain(
      "mx-auto w-full max-w-5xl px-3 py-5 md:px-6 md:py-6",
    );
    expect(settingsPage).toContain(
      "flex w-full flex-row gap-1 p-2 md:flex-col",
    );
    expect(settingsPage).not.toContain("md:p-3");
  });
});
