import type { ModelMetadata, ReasoningMode } from "../../types";

export const REASONING_MODES: readonly ReasoningMode[] = [
  "off",
  "auto",
  "low",
  "medium",
  "high",
];

export const EXPLICIT_REASONING_EFFORTS = ["low", "medium", "high"] as const;

export type ExplicitReasoningEffort =
  (typeof EXPLICIT_REASONING_EFFORTS)[number];

export function isReasoningMode(value: unknown): value is ReasoningMode {
  return (
    value === "off" ||
    value === "auto" ||
    value === "low" ||
    value === "medium" ||
    value === "high"
  );
}

export function isExplicitReasoningEffort(
  value: unknown,
): value is ExplicitReasoningEffort {
  return value === "low" || value === "medium" || value === "high";
}

export function normalizeReasoningMode(
  value: unknown,
  legacyUseReasoning?: unknown,
  fallback: ReasoningMode = "off",
): ReasoningMode {
  if (isReasoningMode(value)) return value;
  if (typeof legacyUseReasoning === "boolean") {
    return legacyUseReasoning ? "high" : "off";
  }
  return fallback;
}

export function isReasoningEnabled(mode: ReasoningMode | undefined): boolean {
  return mode !== undefined && mode !== "off";
}

export function getSupportedReasoningEfforts(
  metadata?: Pick<ModelMetadata, "reasoning_options">,
): readonly ExplicitReasoningEffort[] {
  const effortOption = metadata?.reasoning_options?.find(
    (option) => option.type === "effort",
  );

  return effortOption ? effortOption.values : EXPLICIT_REASONING_EFFORTS;
}

export function getAvailableReasoningModes(
  metadata?: Pick<ModelMetadata, "reasoning_options">,
): ReasoningMode[] {
  return ["off", "auto", ...getSupportedReasoningEfforts(metadata)];
}

export function resolveReasoningModeForModel(
  value: unknown,
  metadata?: Pick<ModelMetadata, "reasoning_options">,
  legacyUseReasoning?: unknown,
): ReasoningMode {
  const reasoningMode = normalizeReasoningMode(value, legacyUseReasoning);
  if (!isExplicitReasoningEffort(reasoningMode)) return reasoningMode;

  return getSupportedReasoningEfforts(metadata).includes(reasoningMode)
    ? reasoningMode
    : "auto";
}
