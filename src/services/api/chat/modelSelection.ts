import { getTaskModel, useSettingsStore } from "@/store/core/settingsStore";
import type { ModelMetadata } from "@/types";
import { parseModelString, supportsTextOutput } from "@/lib/utils/model";

export function resolveModelMetadata(
  modelName: string,
): ModelMetadata | undefined {
  const { modelMetadata, customModelMetadata } = useSettingsStore.getState();
  return customModelMetadata?.[modelName] || modelMetadata?.[modelName];
}

function resolveModelStringMetadata(model: string): ModelMetadata | undefined {
  const { modelName } = parseModelString(model);
  return resolveModelMetadata(modelName);
}

export function resolveTextGenerationModel({
  selectedModel,
  selectedModelMetadata,
  providers,
}: {
  selectedModel: string;
  selectedModelMetadata?: ModelMetadata;
  providers: Array<{
    id: string;
    enabled?: boolean;
    models?: string[];
  }>;
}): string | undefined {
  if (supportsTextOutput(selectedModelMetadata)) return selectedModel;

  const taskModel = getTaskModel("promptOptimization").trim();
  if (taskModel && supportsTextOutput(resolveModelStringMetadata(taskModel))) {
    return taskModel;
  }

  const fallback = providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) =>
      (provider.models || []).map((modelName) => ({
        id: `${provider.id}:${modelName}`,
        metadata: resolveModelMetadata(modelName),
      })),
    )
    .find((candidate) => supportsTextOutput(candidate.metadata));

  return fallback?.id;
}
