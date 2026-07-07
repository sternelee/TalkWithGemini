import type { ModelMetadata } from "../../types";
import { MODEL_METADATA_LIMITS } from "../../config/limits";

const INCLUDED_METADATA_PROVIDERS = new Set([
  "openai",
  "google",
  "anthropic",
  "xai",
  "alibaba",
  "deepseek",
  "mistral",
  "moonshotai",
  "zai",
  "perplexity",
  "v0",
  "vercel",
]);

function trimString(value: unknown, maxChars: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxChars) : "";
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function finiteNumberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : undefined;
}

function boundedTokenLimit(value: unknown, max: number): number | undefined {
  const numberValue = finiteNumberOrUndefined(value);
  return numberValue === undefined ? undefined : Math.min(numberValue, max);
}

function normalizeModalities(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;

  const modalities: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    const modality = trimString(item, MODEL_METADATA_LIMITS.maxModalityChars);
    const key = modality.toLowerCase();
    if (!modality || seen.has(key)) continue;

    modalities.push(modality);
    seen.add(key);
    if (modalities.length >= MODEL_METADATA_LIMITS.maxModalities) break;
  }

  return modalities.length > 0 ? modalities : undefined;
}

function normalizeReasoningOptions(
  value: unknown,
): ModelMetadata["reasoning_options"] | undefined {
  if (!Array.isArray(value)) return undefined;

  const values: Array<"low" | "medium" | "high"> = [];
  const seen = new Set<string>();
  let hasEffortOption = false;

  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const option = item as Record<string, unknown>;
    if (trimString(option.type, 40).toLowerCase() !== "effort") continue;

    hasEffortOption = true;
    if (!Array.isArray(option.values)) continue;

    for (const rawValue of option.values) {
      const effort = trimString(rawValue, 40).toLowerCase();
      if (effort !== "low" && effort !== "medium" && effort !== "high") {
        continue;
      }
      if (seen.has(effort)) continue;

      values.push(effort);
      seen.add(effort);
    }
  }

  return hasEffortOption ? [{ type: "effort", values }] : undefined;
}

export function normalizeModelMetadata(
  value: unknown,
  fallbackId?: string,
): ModelMetadata | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;

  const id =
    trimString(raw.id, MODEL_METADATA_LIMITS.maxIdChars) ||
    trimString(fallbackId, MODEL_METADATA_LIMITS.maxIdChars);
  if (!id) return null;

  const name = trimString(raw.name, MODEL_METADATA_LIMITS.maxNameChars) || id;
  const modalities =
    raw.modalities && typeof raw.modalities === "object"
      ? (raw.modalities as Record<string, unknown>)
      : {};
  const cost =
    raw.cost && typeof raw.cost === "object"
      ? (raw.cost as Record<string, unknown>)
      : {};
  const limit =
    raw.limit && typeof raw.limit === "object"
      ? (raw.limit as Record<string, unknown>)
      : {};

  const metadata: ModelMetadata = {
    id,
    name,
  };

  const family = trimString(raw.family, MODEL_METADATA_LIMITS.maxFamilyChars);
  if (family) metadata.family = family;

  const knowledge = trimString(
    raw.knowledge,
    MODEL_METADATA_LIMITS.maxKnowledgeChars,
  );
  if (knowledge) metadata.knowledge = knowledge;

  const releaseDate = trimString(
    raw.release_date,
    MODEL_METADATA_LIMITS.maxDateChars,
  );
  if (releaseDate) metadata.release_date = releaseDate;

  const lastUpdated = trimString(
    raw.last_updated,
    MODEL_METADATA_LIMITS.maxDateChars,
  );
  if (lastUpdated) metadata.last_updated = lastUpdated;

  for (const key of [
    "attachment",
    "reasoning",
    "tool_call",
    "temperature",
    "structured_output",
    "open_weights",
  ] as const) {
    const boolValue = booleanOrUndefined(raw[key]);
    if (boolValue !== undefined) metadata[key] = boolValue;
  }

  const inputModalities = normalizeModalities(modalities.input);
  const outputModalities = normalizeModalities(modalities.output);
  if (inputModalities || outputModalities) {
    metadata.modalities = {
      ...(inputModalities ? { input: inputModalities } : {}),
      ...(outputModalities ? { output: outputModalities } : {}),
    };
  }

  const reasoningOptions = normalizeReasoningOptions(raw.reasoning_options);
  if (reasoningOptions) {
    metadata.reasoning_options = reasoningOptions;
  }

  const normalizedCost: NonNullable<ModelMetadata["cost"]> = {
    input: finiteNumberOrUndefined(cost.input) || 0,
    output: finiteNumberOrUndefined(cost.output) || 0,
  };
  for (const key of [
    "cache_read",
    "cache_write",
    "reasoning",
    "input_audio",
    "output_audio",
  ] as const) {
    const costValue = finiteNumberOrUndefined(cost[key]);
    if (costValue !== undefined) normalizedCost[key] = costValue;
  }
  if (
    normalizedCost.input > 0 ||
    normalizedCost.output > 0 ||
    Object.keys(normalizedCost).length > 2
  ) {
    metadata.cost = normalizedCost;
  }

  const context = boundedTokenLimit(
    limit.context,
    MODEL_METADATA_LIMITS.maxContextTokens,
  );
  const output = boundedTokenLimit(
    limit.output,
    MODEL_METADATA_LIMITS.maxOutputTokens,
  );
  if (context !== undefined || output !== undefined) {
    metadata.limit = {
      ...(context !== undefined ? { context } : {}),
      ...(output !== undefined ? { output } : {}),
    };
  }

  return metadata;
}

export function normalizeModelMetadataMap(
  value: unknown,
): Record<string, ModelMetadata> {
  if (!value || typeof value !== "object") return {};

  const result: Record<string, ModelMetadata> = {};

  for (const [key, item] of Object.entries(value)) {
    const metadata = normalizeModelMetadata(item, key);
    if (!metadata) continue;

    result[metadata.id] = metadata;
    if (Object.keys(result).length >= MODEL_METADATA_LIMITS.maxEntries) break;
  }

  return result;
}

export function extractKnownProviderModelMetadata(
  value: unknown,
): Record<string, ModelMetadata> {
  if (!value || typeof value !== "object") return {};

  const result: Record<string, ModelMetadata> = {};

  for (const provider of Object.values(value)) {
    if (!provider || typeof provider !== "object") continue;
    const providerRecord = provider as Record<string, unknown>;
    const providerId = trimString(providerRecord.id, 100).toLowerCase();
    if (!INCLUDED_METADATA_PROVIDERS.has(providerId)) continue;

    const models =
      providerRecord.models && typeof providerRecord.models === "object"
        ? (providerRecord.models as Record<string, unknown>)
        : {};
    for (const [key, model] of Object.entries(models)) {
      const metadata = normalizeModelMetadata(model, key);
      if (!metadata) continue;

      result[metadata.id] = metadata;
      if (Object.keys(result).length >= MODEL_METADATA_LIMITS.maxEntries) {
        return result;
      }
    }
  }

  return result;
}
