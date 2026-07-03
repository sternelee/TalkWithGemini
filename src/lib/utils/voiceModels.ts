import type { ModelProvider } from "@/types";
import { parseModelString } from "./model";

export const ELEVENLABS_STT_MODELS = ["scribe_v2", "scribe_v1"] as const;
export type ElevenLabsSTTModel = (typeof ELEVENLABS_STT_MODELS)[number];

export function isElevenLabsSTTModel(
  modelId?: string,
): modelId is ElevenLabsSTTModel {
  return (
    typeof modelId === "string" &&
    ELEVENLABS_STT_MODELS.includes(modelId as ElevenLabsSTTModel)
  );
}

export function getAvailableProviderModel(
  modelString: string | undefined,
  providers: ModelProvider[],
):
  | {
      provider: ModelProvider;
      modelId: string;
    }
  | undefined {
  if (!modelString) return undefined;

  const { providerId, modelName } = parseModelString(modelString);
  if (!providerId || !modelName) return undefined;

  const provider = providers.find((item) => item.id === providerId);
  if (!provider?.enabled || !provider.models.includes(modelName)) {
    return undefined;
  }

  return { provider, modelId: modelName };
}

export function isProviderModelAvailable(
  modelString: string | undefined,
  providers: ModelProvider[],
): boolean {
  return !!getAvailableProviderModel(modelString, providers);
}
