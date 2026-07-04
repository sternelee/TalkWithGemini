import { describe, expect, it } from "vitest";
import {
  getDefaultModelSelectValue,
  pruneUnavailableDefaultModels,
} from "../lib/utils/defaultModels";
import { buildAvailableModels } from "../lib/utils/models";
import type { DefaultModels, ModelProvider } from "../types";

const defaultModels: DefaultModels = {
  titleGeneration: "A:model-a",
  relatedQuestions: "B:model-b",
  contextCompression: "A:missing",
  promptOptimization: "",
  ragQuery: "C:model-c",
  memory: "A:model-a",
};

const providers: ModelProvider[] = [
  {
    id: "A",
    name: "Provider A",
    type: "OpenAI",
    baseUrl: "https://api.example.com",
    apiKey: "key",
    enabled: true,
    models: ["model-a"],
    modelsList: ["model-a"],
  },
  {
    id: "B",
    name: "Provider B",
    type: "OpenAI",
    baseUrl: "https://api.example.com",
    apiKey: "key",
    enabled: false,
    models: ["model-b"],
    modelsList: ["model-b"],
  },
];

describe("default model pruning", () => {
  it("keeps available defaults and clears unavailable provider/model references", () => {
    expect(pruneUnavailableDefaultModels(defaultModels, providers)).toEqual({
      titleGeneration: "A:model-a",
      relatedQuestions: "",
      contextCompression: "",
      promptOptimization: "",
      ragQuery: "",
      memory: "A:model-a",
    });
  });

  it("uses the saved default model for the select value when it is available", () => {
    expect(
      getDefaultModelSelectValue(defaultModels, "titleGeneration", providers),
    ).toBe("A:model-a");
  });

  it("falls back to an available model only when no saved default is valid", () => {
    expect(
      getDefaultModelSelectValue(
        defaultModels,
        "contextCompression",
        providers,
      ),
    ).toBe("A:model-a");
  });

  it("does not synthesize Gemini models when no provider is available", () => {
    expect(buildAvailableModels([], {}, {}, () => null)).toEqual([]);
  });
});
