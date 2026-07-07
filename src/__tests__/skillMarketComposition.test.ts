import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("SkillMarket composition", () => {
  it("uses install/uninstall storage actions instead of global activation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/skill/SkillMarket.tsx"),
      "utf8",
    );

    expect(source).toContain("RefreshCw");
    expect(source).toContain("fetchSkillDefinition");
    expect(source).toContain("installSkill");
    expect(source).toContain("uninstallSkill");
    expect(source).toContain("uninstallConfirmingSkillId");
    expect(source).toContain("confirmUninstallSkill");
    expect(source).toContain('t("confirmUninstall")');
    expect(source).toContain('aria-label={t("removeTagAria", { tag })}');
    expect(source).toContain("focus-visible:ring-2");
    expect(source).toContain("updateInstalledSkill");
    expect(source).not.toContain("toggleSkillActive");
  });

  it("keeps the category filter in the all-skills title row", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/skill/SkillMarket.tsx"),
      "utf8",
    );

    expect(source).toContain(
      'searchTerm ? t("searchResults") : t("allSkills")',
    );
    expect(source).not.toContain(
      'searchTerm ? t("searchResults") : t("availableSkills")',
    );
    expect(source.indexOf("const renderCategoryFilter")).toBeLessThan(
      source.indexOf("{/* Search Bar */}"),
    );
    expect(source.indexOf("{/* Search Bar */}")).toBeLessThan(
      source.indexOf("{/* Available Section */}"),
    );
    expect(source.indexOf("{/* Available Section */}")).toBeLessThan(
      source.indexOf("{renderCategoryFilter()}"),
    );
  });
});
