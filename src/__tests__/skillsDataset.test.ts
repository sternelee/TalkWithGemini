import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeSkillCatalog, normalizeTextSkill } from "../lib/skills";

const skillsDir = resolve(process.cwd(), "public/data/skills");

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("public skills dataset", () => {
  it("ships modular localized text-only skills data under public/data/skills", () => {
    const schema = readJson(
      resolve(process.cwd(), "public/data/skills.schema.json"),
    );
    const englishCatalog = normalizeSkillCatalog(
      readJson(resolve(skillsDir, "skills.metadata.json")),
    );
    const zhCatalog = normalizeSkillCatalog(
      readJson(resolve(skillsDir, "skills.metadata.zh-CN.json")),
    );
    const ids = new Set(englishCatalog.skills.map((skill) => skill.id));

    expect(schema.$id).toBe("skills.schema.json");
    expect(schema.title).toBe("Skills Dataset");
    expect(englishCatalog.schemaVersion).toBe("skills-v1");
    expect(zhCatalog.schemaVersion).toBe("skills-v1");
    expect(englishCatalog.skills).toHaveLength(57);
    expect(zhCatalog.skills).toHaveLength(57);
    expect(ids.size).toBe(57);
    expect(englishCatalog.skillCount).toBe(57);
    expect(englishCatalog.categories).toContain("writing");
    expect(englishCatalog.skills.every((skill) => !("content" in skill))).toBe(
      true,
    );
    expect(
      englishCatalog.skills.every(
        (skill) =>
          skill.title &&
          skill.description &&
          skill.file &&
          !skill.file.includes("..") &&
          existsSync(resolve(skillsDir, skill.file)),
      ),
    ).toBe(true);
    expect(
      zhCatalog.skills.every((skill) => {
        const file = skill.file;
        return (
          Boolean(file) &&
          file!.endsWith(".zh-CN.json") &&
          existsSync(resolve(skillsDir, file!))
        );
      }),
    ).toBe(true);

    for (const entry of englishCatalog.skills) {
      expect(entry.file).toBeTruthy();
      const entryFile = entry.file!;
      const enDefinition = normalizeTextSkill(
        readJson(resolve(skillsDir, entryFile)),
      );
      const zhEntry = zhCatalog.skills.find((skill) => skill.id === entry.id);
      expect(zhEntry).toBeTruthy();
      expect(zhEntry?.file).toBeTruthy();
      const zhEntryFile = zhEntry!.file!;
      const zhDefinition = normalizeTextSkill(
        readJson(resolve(skillsDir, zhEntryFile)),
      );

      expect(enDefinition?.content).toBeTruthy();
      expect(zhDefinition?.content).toBeTruthy();
      expect(enDefinition!.content.length).toBeGreaterThan(1_000);
      expect(zhDefinition!.content.length).toBeGreaterThan(900);
      expect(enDefinition!.content).toContain("## Output Contract");
      expect(zhDefinition!.content).toContain("## 输出要求");
      expect(enDefinition?.risk.textOnly).toBe(true);
      expect(zhDefinition?.risk.textOnly).toBe(true);
      expect(enDefinition?.risk.scriptRequired).toBe(false);
      expect(zhDefinition?.risk.scriptRequired).toBe(false);
      expect(enDefinition?.risk.externalToolRequired).toBe(false);
      expect(zhDefinition?.risk.externalToolRequired).toBe(false);
      expect(enDefinition?.risk.networkRequired).toBe(false);
      expect(zhDefinition?.risk.networkRequired).toBe(false);
    }
  });

  it("does not keep legacy dataset names or runtime files", () => {
    const legacyRuntimeFile = ["skills", "v1", "json"].join(".");
    const legacyPrefix = ["frontend", "text"].join("-");
    const legacyLabel = ["Frontend", "Text-Only"].join(" ");
    const schemaSource = readFileSync(
      resolve(process.cwd(), "public/data/skills.schema.json"),
      "utf8",
    );
    const skillsSource = readFileSync(
      resolve(process.cwd(), "src/lib/skills/index.ts"),
      "utf8",
    );
    const skillServiceSource = readFileSync(
      resolve(process.cwd(), "src/services/api/skillService.ts"),
      "utf8",
    );

    expect(
      existsSync(resolve(process.cwd(), "public/data", legacyRuntimeFile)),
    ).toBe(false);
    expect(schemaSource).not.toContain(legacyPrefix);
    expect(schemaSource).not.toContain(legacyLabel);
    expect(skillsSource).not.toContain(legacyPrefix);
    expect(skillServiceSource).not.toContain(legacyRuntimeFile);
  });
});
