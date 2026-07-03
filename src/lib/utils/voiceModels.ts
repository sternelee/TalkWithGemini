import type { ModelProvider } from "@/types";
import { parseModelString } from "./model";

export const ELEVENLABS_STT_MODELS = ["scribe_v2", "scribe_v1"] as const;
export type ElevenLabsSTTModel = (typeof ELEVENLABS_STT_MODELS)[number];

export const DEFAULT_ELEVENLABS_TTS_MODEL = "eleven_flash_v2_5" as const;
export const ELEVENLABS_TTS_MODELS = [
  DEFAULT_ELEVENLABS_TTS_MODEL,
  "eleven_multilingual_v2",
  "eleven_flash_v2",
  "eleven_v3",
] as const;
export type ElevenLabsTTSModel = (typeof ELEVENLABS_TTS_MODELS)[number];

export function isElevenLabsSTTModel(
  modelId?: string,
): modelId is ElevenLabsSTTModel {
  return (
    typeof modelId === "string" &&
    ELEVENLABS_STT_MODELS.includes(modelId as ElevenLabsSTTModel)
  );
}

export function isElevenLabsTTSModel(
  modelId?: string,
): modelId is ElevenLabsTTSModel {
  return (
    typeof modelId === "string" &&
    ELEVENLABS_TTS_MODELS.includes(modelId as ElevenLabsTTSModel)
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
