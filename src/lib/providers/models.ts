import { PROVIDER_MODEL_LIMITS } from "../../config/limits";
import type { ProviderType } from "../../types";

export function normalizeProviderModelId(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const modelId = value.trim().replace(/^models\//, "");
  if (!modelId) return null;

  return modelId.slice(0, PROVIDER_MODEL_LIMITS.maxModelIdChars);
}

export function extractProviderModelIds(
  providerType: ProviderType,
  data: any,
): string[] {
  const models = providerType === "Gemini" ? data?.models : data?.data;
  if (!Array.isArray(models)) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const model of models) {
    if (providerType === "Gemini") {
      const methods = model?.supportedGenerationMethods;
      if (!Array.isArray(methods) || !methods.includes("generateContent")) {
        continue;
      }
    }

    const modelId = normalizeProviderModelId(
      providerType === "Gemini" ? model?.name : model?.id,
    );
    if (!modelId || seen.has(modelId)) continue;

    seen.add(modelId);
    result.push(modelId);

    if (result.length >= PROVIDER_MODEL_LIMITS.maxModels) break;
  }

  return result;
}
