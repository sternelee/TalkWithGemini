"use client";

import { useMemo } from "react";
import type { ModelMetadata, ReasoningMode } from "@/types";
import { parseModelString, supportsModality } from "@/lib/utils/model";
import {
  getAvailableReasoningModes,
  isReasoningEnabled,
  resolveReasoningModeForModel,
} from "@/lib/chat/reasoning";

export type ComposerCapabilityState = {
  selectedModelMetadata?: ModelMetadata;
  modelCapabilities: {
    vision: boolean;
    attachment: boolean;
    audio: boolean;
    video: boolean;
    reasoning: boolean;
  };
  isReasoningSupported: boolean;
  currentReasoningMode: ReasoningMode;
  isReasoningEnabledForMode: boolean;
  reasoningOptions: Array<{
    value: ReasoningMode;
    label: string;
    description: string;
  }>;
  currentReasoningOption: {
    value: ReasoningMode;
    label: string;
    description: string;
  };
};

export function useComposerCapabilityState({
  selectedModel,
  modelMetadata,
  customModelMetadata,
  reasoningMode,
  useReasoning,
  reasoningOptionLabels,
}: {
  selectedModel: string;
  modelMetadata: Record<string, ModelMetadata>;
  customModelMetadata: Record<string, ModelMetadata>;
  reasoningMode: ReasoningMode;
  useReasoning: boolean;
  reasoningOptionLabels: Record<
    ReasoningMode,
    { label: string; description: string }
  >;
}): ComposerCapabilityState {
  const selectedModelMetadata = useMemo(() => {
    if (!selectedModel) return undefined;

    const { modelName: modelId } = parseModelString(selectedModel);
    return customModelMetadata[modelId] || modelMetadata[modelId];
  }, [selectedModel, modelMetadata, customModelMetadata]);

  const modelCapabilities = useMemo(() => {
    if (!selectedModel) {
      return {
        vision: false,
        attachment: false,
        audio: false,
        video: false,
        reasoning: false,
      };
    }

    return {
      vision: supportsModality(selectedModelMetadata, "image", "input"),
      attachment: selectedModelMetadata?.attachment ?? false,
      audio: supportsModality(selectedModelMetadata, "audio", "input"),
      video: supportsModality(selectedModelMetadata, "video", "input"),
      reasoning: selectedModelMetadata?.reasoning ?? false,
    };
  }, [selectedModel, selectedModelMetadata]);

  const isReasoningSupported = useMemo(() => {
    if (!selectedModel) return false;
    const { modelName: modelId } = parseModelString(selectedModel);

    if (selectedModelMetadata?.reasoning !== undefined) {
      return selectedModelMetadata.reasoning;
    }

    const lower = modelId.toLowerCase();
    return (
      lower.includes("thinking") ||
      lower.includes("reasoner") ||
      lower.includes("o1") ||
      lower.includes("r1")
    );
  }, [selectedModel, selectedModelMetadata]);

  const currentReasoningMode = resolveReasoningModeForModel(
    reasoningMode,
    selectedModelMetadata,
    useReasoning,
  );
  const isReasoningEnabledForMode = isReasoningEnabled(currentReasoningMode);
  const reasoningOptions = useMemo(
    () =>
      getAvailableReasoningModes(selectedModelMetadata).map((value) => ({
        value,
        ...reasoningOptionLabels[value],
      })),
    [selectedModelMetadata, reasoningOptionLabels],
  );
  const currentReasoningOption =
    reasoningOptions.find((option) => option.value === currentReasoningMode) ||
    reasoningOptions[0];

  return {
    selectedModelMetadata,
    modelCapabilities,
    isReasoningSupported,
    currentReasoningMode,
    isReasoningEnabledForMode,
    reasoningOptions,
    currentReasoningOption,
  };
}
