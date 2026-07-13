import type { DefaultModels, ModelProvider } from "@/types";

function getAvailableModelIds(providers: ModelProvider[]): Set<string> {
  return new Set(
    providers
      .filter((provider) => provider.enabled)
      .flatMap((provider) =>
        provider.models.map((model) => `${provider.id}:${model}`),
      ),
  );
}

export function getDefaultModelSelectValue(
  defaultModels: DefaultModels,
  task: keyof DefaultModels,
  providers: ModelProvider[],
): string {
  const configured = defaultModels[task];
  const availableModels = providers
    .filter((provider) => provider.enabled)
    .flatMap((provider) =>
      provider.models.map((model) => ({
        fullId: `${provider.id}:${model}`,
        modelName: model,
      })),
    );

  if (
    configured &&
    availableModels.some((model) => model.fullId === configured)
  ) {
    return configured;
  }

  for (const priorityName of ["gemini-2.5-flash-lite", "gpt-4o-mini"]) {
    const match = availableModels.find(
      (model) => model.modelName === priorityName,
    );
    if (match) return match.fullId;
  }

  return availableModels[0]?.fullId || "";
}

export function pruneUnavailableDefaultModels(
  defaultModels: DefaultModels,
  providers: ModelProvider[],
): DefaultModels {
  const availableModelIds = getAvailableModelIds(providers);
  const nextDefaultModels = { ...defaultModels };

  for (const key of Object.keys(nextDefaultModels) as Array<
    keyof DefaultModels
  >) {
    const modelId = nextDefaultModels[key];
    if (modelId && !availableModelIds.has(modelId)) {
      nextDefaultModels[key] = "";
    }
  }

  return nextDefaultModels;
}
