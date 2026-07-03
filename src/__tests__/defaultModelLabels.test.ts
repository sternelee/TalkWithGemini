import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("default model labels", () => {
  it("renames prompt optimization to text polishing in both locales", () => {
    const zh = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/i18n/locales/zh.json"), "utf8"),
    );
    const en = JSON.parse(
      readFileSync(resolve(process.cwd(), "src/i18n/locales/en.json"), "utf8"),
    );

    expect(zh.DefaultModels.promptOptimization).toBe("文本润色");
    expect(zh.DefaultModels.promptOptimizationDesc).toBe(
      "使用 AI 对文本内容进行优化",
    );
    expect(en.DefaultModels.promptOptimization).toBe("Text Polishing");
  });
});
