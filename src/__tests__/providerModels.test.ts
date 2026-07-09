import { describe, expect, it } from "vitest";
import { PROVIDER_MODEL_LIMITS } from "../config/limits";
import { extractProviderModelIds } from "../lib/providers/models";

describe("provider model extraction", () => {
  it("filters Google models to generateContent-capable ids", () => {
    expect(
      extractProviderModelIds("Google", {
        models: [
          {
            name: "models/gemini-2.5-pro",
            supportedGenerationMethods: ["generateContent"],
          },
          {
            name: "models/embed-only",
            supportedGenerationMethods: ["embedContent"],
          },
          {
            name: "models/gemini-2.5-pro",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      }),
    ).toEqual(["gemini-2.5-pro"]);
  });

  it("normalizes legacy Gemini model extraction to Google", () => {
    expect(
      extractProviderModelIds("Gemini", {
        models: [
          {
            name: "models/gemini-2.5-flash",
            supportedGenerationMethods: ["generateContent"],
          },
        ],
      }),
    ).toEqual(["gemini-2.5-flash"]);
  });

  it("deduplicates and trims OpenAI-compatible model ids", () => {
    expect(
      extractProviderModelIds("OpenAI", {
        data: [
          { id: " gpt-5 " },
          { id: "gpt-5" },
          { id: "" },
          { id: 42 },
          { id: "o4-mini" },
        ],
      }),
    ).toEqual(["gpt-5", "o4-mini"]);
  });

  it("treats OpenAI Compatible model lists like OpenAI model lists", () => {
    expect(
      extractProviderModelIds("OpenAI Compatible", {
        data: [{ id: "chat-model" }, { id: "chat-model" }],
      }),
    ).toEqual(["chat-model"]);
  });

  it("extracts Anthropic model ids from data lists", () => {
    expect(
      extractProviderModelIds("Anthropic", {
        data: [{ id: "claude-sonnet-5" }, { id: " claude-haiku-5 " }],
      }),
    ).toEqual(["claude-sonnet-5", "claude-haiku-5"]);
  });

  it("caps model id length and total model count", () => {
    const models = Array.from(
      { length: PROVIDER_MODEL_LIMITS.maxModels + 5 },
      (_, index) => ({
        id:
          index === 0
            ? "m".repeat(PROVIDER_MODEL_LIMITS.maxModelIdChars + 10)
            : `model-${index}`,
      }),
    );

    const result = extractProviderModelIds("OpenAI", { data: models });

    expect(result).toHaveLength(PROVIDER_MODEL_LIMITS.maxModels);
    expect(result[0]).toHaveLength(PROVIDER_MODEL_LIMITS.maxModelIdChars);
  });
});
