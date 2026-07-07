import { describe, expect, it } from "vitest";
import { MODEL_METADATA_LIMITS } from "../config/limits";
import {
  extractKnownProviderModelMetadata,
  normalizeModelMetadata,
  normalizeModelMetadataMap,
} from "../lib/providers/metadata";
import {
  supportsImageEditing,
  supportsImageGeneration,
  supportsModality,
  supportsTextOutput,
} from "../lib/utils/model";

describe("model metadata normalization", () => {
  it("trims model metadata fields and normalizes modalities", () => {
    const metadata = normalizeModelMetadata({
      id: " model-a ",
      name: "x".repeat(MODEL_METADATA_LIMITS.maxNameChars + 10),
      family: " family ",
      attachment: true,
      reasoning: "yes",
      modalities: {
        input: [" text ", "text", "", "image"],
        output: ["audio"],
      },
      cost: {
        input: 1,
        output: 2,
        reasoning: -10,
      },
      limit: {
        context: MODEL_METADATA_LIMITS.maxContextTokens + 10,
        output: MODEL_METADATA_LIMITS.maxOutputTokens + 10,
      },
    });

    expect(metadata).toMatchObject({
      id: "model-a",
      family: "family",
      attachment: true,
      modalities: {
        input: ["text", "image"],
        output: ["audio"],
      },
      cost: {
        input: 1,
        output: 2,
        reasoning: 0,
      },
      limit: {
        context: MODEL_METADATA_LIMITS.maxContextTokens,
        output: MODEL_METADATA_LIMITS.maxOutputTokens,
      },
    });
    expect(metadata?.name).toHaveLength(MODEL_METADATA_LIMITS.maxNameChars);
    expect(metadata?.reasoning).toBeUndefined();
  });

  it("detects image generation and editing from normalized modalities", () => {
    const generator = normalizeModelMetadata({
      id: "gpt-image-2",
      name: "GPT Image 2",
      modalities: {
        input: ["TEXT"],
        output: ["IMAGE"],
      },
    });
    const editor = normalizeModelMetadata({
      id: "gemini-3.1-flash-image",
      name: "Gemini Flash Image",
      modalities: {
        input: ["text", "image"],
        output: ["text", "image"],
      },
    });

    expect(supportsModality(generator || undefined, "image", "output")).toBe(
      true,
    );
    expect(supportsImageGeneration(generator || undefined)).toBe(true);
    expect(supportsImageEditing(generator || undefined)).toBe(false);
    expect(supportsImageGeneration(editor || undefined)).toBe(true);
    expect(supportsImageEditing(editor || undefined)).toBe(true);
    expect(supportsTextOutput(undefined)).toBe(true);
    expect(supportsTextOutput(generator || undefined)).toBe(false);
  });

  it("uses fallback ids and caps metadata maps", () => {
    const source = Object.fromEntries(
      Array.from(
        { length: MODEL_METADATA_LIMITS.maxEntries + 5 },
        (_, index) => [`model-${index}`, { name: `Model ${index}` }],
      ),
    );
    const normalized = normalizeModelMetadataMap(source);

    expect(Object.keys(normalized)).toHaveLength(
      MODEL_METADATA_LIMITS.maxEntries,
    );
    expect(normalized["model-0"]).toMatchObject({
      id: "model-0",
      name: "Model 0",
    });
  });

  it("sanitizes reasoning effort options to supported explicit strengths", () => {
    const metadata = normalizeModelMetadata({
      id: "gpt-effort",
      name: "GPT Effort",
      reasoning: true,
      reasoning_options: [
        {
          type: "effort",
          values: [
            "none",
            "low",
            "medium",
            "low",
            "high",
            "xhigh",
            "minimal",
            "max",
            "default",
          ],
        },
        { type: "budget_tokens", min: 1024, max: 8192 },
      ],
    });

    expect(metadata).toMatchObject({
      id: "gpt-effort",
      name: "GPT Effort",
      reasoning: true,
      reasoning_options: [
        {
          type: "effort",
          values: ["low", "medium", "high"],
        },
      ],
    });
  });

  it("extracts only known providers from external provider metadata", () => {
    const metadata = extractKnownProviderModelMetadata({
      openai: {
        id: "openai",
        models: {
          "gpt-5": { id: "gpt-5", name: "GPT-5" },
        },
      },
      unknown: {
        id: "unknown",
        models: {
          "bad-model": { id: "bad-model", name: "Bad" },
        },
      },
      malformed: null,
    });

    expect(metadata).toEqual({
      "gpt-5": { id: "gpt-5", name: "GPT-5" },
    });
  });
});
