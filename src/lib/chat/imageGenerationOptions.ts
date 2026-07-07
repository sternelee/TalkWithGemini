import { IMAGE_GENERATION_LIMITS } from "../../config/limits";
import type { ModelMetadata } from "../../types";
import {
  parseModelString,
  supportsImageGeneration,
  supportsTextOutput,
} from "../utils/model";

export interface ImageGenerationOptions {
  imageCount?: number;
}

export interface ImageGenerationPlanningModel {
  id: string;
  metadata?: ModelMetadata;
}

export interface ResolveImageGenerationOptionsInput {
  userMessage: string;
  selectedModel: string;
  selectedModelMetadata?: ModelMetadata;
  defaultPromptOptimizationModel?: string;
  availableModels: ImageGenerationPlanningModel[];
  generate: (model: string, prompt: string) => Promise<string>;
}

function clampImageCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isInteger(value)) return undefined;
  if (
    value < IMAGE_GENERATION_LIMITS.minCount ||
    value > IMAGE_GENERATION_LIMITS.maxCount
  ) {
    return undefined;
  }
  return value;
}

export function parseImageGenerationOptions(
  raw: string,
): ImageGenerationOptions {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const imageCount = clampImageCount(
      (parsed as Record<string, unknown>).imageCount,
    );
    return imageCount ? { imageCount } : {};
  } catch {
    return {};
  }
}

function createImageGenerationOptionsPrompt(userMessage: string): string {
  return [
    "Decide optional image generation request options for a chat app.",
    'Return strict JSON only: {} or {"imageCount": number}.',
    `imageCount must be an integer from ${IMAGE_GENERATION_LIMITS.minCount} to ${IMAGE_GENERATION_LIMITS.maxCount}.`,
    "Only set imageCount when the user clearly asks for multiple separate images, variants, options, or a specific number of images.",
    "Do not set imageCount for one image that contains multiple panels, objects, people, or comparison sections.",
    "",
    "User request:",
    userMessage,
  ].join("\n");
}

function getPlanningModel({
  selectedModel,
  selectedModelMetadata,
  defaultPromptOptimizationModel,
  availableModels,
}: Omit<ResolveImageGenerationOptionsInput, "userMessage" | "generate">) {
  if (supportsTextOutput(selectedModelMetadata)) return selectedModel;

  if (defaultPromptOptimizationModel?.trim()) {
    return defaultPromptOptimizationModel.trim();
  }

  const candidate = availableModels.find((model) => {
    const { modelName } = parseModelString(model.id);
    const metadata = model.metadata;
    return (
      modelName &&
      !supportsImageGeneration(metadata) &&
      (metadata ? supportsTextOutput(metadata) : true)
    );
  });

  return candidate?.id;
}

export async function resolveImageGenerationOptions({
  userMessage,
  selectedModel,
  selectedModelMetadata,
  defaultPromptOptimizationModel,
  availableModels,
  generate,
}: ResolveImageGenerationOptionsInput): Promise<ImageGenerationOptions> {
  if (!supportsImageGeneration(selectedModelMetadata)) return {};

  const planningModel = getPlanningModel({
    selectedModel,
    selectedModelMetadata,
    defaultPromptOptimizationModel,
    availableModels,
  });
  if (!planningModel) return {};

  try {
    const raw = await generate(
      planningModel,
      createImageGenerationOptionsPrompt(userMessage),
    );
    return parseImageGenerationOptions(raw);
  } catch {
    return {};
  }
}
