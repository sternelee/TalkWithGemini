import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en";
import zh from "../i18n/locales/zh";

describe("default model labels", () => {
  it("renames prompt optimization to text polishing in both locales", () => {
    expect(zh.DefaultModels.promptOptimization).toBe("文本润色");
    expect(zh.DefaultModels.promptOptimizationDesc).toBe(
      "使用 AI 对文本内容进行优化",
    );
    expect(en.DefaultModels.promptOptimization).toBe("Text Polishing");
  });
});
