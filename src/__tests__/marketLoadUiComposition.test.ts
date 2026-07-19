import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readSource(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("market load state UI composition", () => {
  it.each([
    [
      "plugins",
      "src/components/plugin/PluginMarket.tsx",
      "fetchApiGuruListResult",
    ],
    [
      "assistants",
      "src/components/assistant/AssistantHub.tsx",
      "getAgentsResult",
    ],
    [
      "skills",
      "src/components/skill/SkillMarket.tsx",
      "fetchSkillCatalogResult",
    ],
  ])("keeps %s data visible while surfacing load status", (_, path, api) => {
    const source = readSource(path);

    expect(source).toContain(api);
    expect(source).toContain("MarketLoadNotice");
    expect(source).toContain('["fresh", "cache", "fallback"]');
    expect(source).toContain('t("retry")');
  });

  it("discloses MCP direct registry and localized skill fallbacks", () => {
    const plugins = readSource("src/components/plugin/PluginMarket.tsx");
    const skills = readSource("src/components/skill/SkillMarket.tsx");

    expect(plugins).toContain('t("mcpDirectFallback")');
    expect(skills).toContain('t("englishFallback")');
  });
});
