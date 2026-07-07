import { describe, expect, it, vi } from "vitest";
import {
  parseImageGenerationOptions,
  resolveImageGenerationOptions,
} from "../lib/chat/imageGenerationOptions";
import type { ModelMetadata } from "../types";

const imageTextModel: ModelMetadata = {
  id: "gemini-3.1-flash-image",
  name: "Gemini Flash Image",
  modalities: { input: ["text"], output: ["text", "image"] },
};

const imageOnlyModel: ModelMetadata = {
  id: "gpt-image-2",
  name: "GPT Image 2",
  modalities: { input: ["text", "image"], output: ["image"] },
};

describe("image generation options planning", () => {
  it("parses strict image count JSON and ignores unclear output", () => {
    expect(parseImageGenerationOptions('{"imageCount":3}')).toEqual({
      imageCount: 3,
    });
    expect(parseImageGenerationOptions('{"imageCount":5}')).toEqual({});
    expect(parseImageGenerationOptions("not json")).toEqual({});
  });

  it("uses the selected model when it can also return text", async () => {
    const generate = vi.fn().mockResolvedValue('{"imageCount":3}');

    await expect(
      resolveImageGenerationOptions({
        userMessage: "Generate 3 separate logo concepts.",
        selectedModel: "gemini:gemini-3.1-flash-image",
        selectedModelMetadata: imageTextModel,
        defaultPromptOptimizationModel: "openai:gpt-5-mini",
        availableModels: [],
        generate,
      }),
    ).resolves.toEqual({ imageCount: 3 });

    expect(generate).toHaveBeenCalledWith(
      "gemini:gemini-3.1-flash-image",
      expect.stringContaining("Generate 3 separate logo concepts."),
    );
  });

  it("falls back to a text model for image-only selected models", async () => {
    const generate = vi.fn().mockResolvedValue('{"imageCount":2}');

    await expect(
      resolveImageGenerationOptions({
        userMessage: "Create two variants.",
        selectedModel: "openai:gpt-image-2",
        selectedModelMetadata: imageOnlyModel,
        defaultPromptOptimizationModel: "openai:gpt-5-mini",
        availableModels: [],
        generate,
      }),
    ).resolves.toEqual({ imageCount: 2 });

    expect(generate).toHaveBeenCalledWith(
      "openai:gpt-5-mini",
      expect.any(String),
    );
  });

  it("skips planning when no text model is available", async () => {
    const generate = vi.fn();

    await expect(
      resolveImageGenerationOptions({
        userMessage: "Create three options.",
        selectedModel: "openai:gpt-image-2",
        selectedModelMetadata: imageOnlyModel,
        defaultPromptOptimizationModel: "",
        availableModels: [],
        generate,
      }),
    ).resolves.toEqual({});

    expect(generate).not.toHaveBeenCalled();
  });
});
