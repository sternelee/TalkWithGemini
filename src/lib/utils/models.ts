import { ModelInfo } from "@/services/api/chatService";

/**
 * Default Gemini models configuration
 */
export const DEFAULT_GEMINI_MODELS: ModelInfo[] = [
  {
    name: "GEMINI:gemini-flash-latest",
    displayName: "Gemini Flash Latest",
    description: "Always Latest Flash",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:gemini-3-flash-preview",
    displayName: "Gemini 3 Flash Preview",
    description: "Latest Flash Preview",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:gemini-2.5-flash",
    displayName: "Gemini 2.5 Flash",
    description: "Fast & Versatile",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:gemini-2.5-flash-lite",
    displayName: "Gemini 2.5 Flash Lite",
    description: "Lightweight & Fast",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:gemini-2.5-pro",
    displayName: "Gemini 2.5 Pro",
    description: "Complex Reasoning",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:gemini-2.5-flash-image",
    displayName: "Gemini 2.5 Flash Image",
    description: "Image Generation",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:gemini-2.5-flash-native-audio-preview-12-2025",
    displayName: "Gemini 2.5 Flash Native Audio",
    description: "Native Audio",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:gemini-2.5-flash-preview-tts",
    displayName: "Gemini 2.5 Flash TTS",
    description: "Text to Speech",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:gemini-2.5-pro-preview-tts",
    displayName: "Gemini 2.5 Pro TTS",
    description: "Pro Text to Speech",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:imagen-4.0-generate-001",
    displayName: "Imagen 4.0",
    description: "Image Generation",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:imagen-4.0-ultra-generate-001",
    displayName: "Imagen 4.0 Ultra",
    description: "Ultra Image Generation",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:imagen-4.0-fast-generate-001",
    displayName: "Imagen 4.0 Fast",
    description: "Fast Image Generation",
    providerName: "Google Gemini",
  },
  {
    name: "GEMINI:imagen-3.0-generate-002",
    displayName: "Imagen 3.0",
    description: "Image Generation",
    providerName: "Google Gemini",
  },
];

/**
 * Build available models list from providers
 */
export const buildAvailableModels = (
  providers: any[],
  modelMetadata: Record<string, any>,
  customModelMetadata: Record<string, any>,
  formatModelName: (
    modelId: string,
    modelMetadata: Record<string, any>,
    customModelMetadata: Record<string, any>,
  ) => string | null,
): ModelInfo[] => {
  const allModels: ModelInfo[] = [];

  providers.forEach((p) => {
    if (p.enabled && p.models && p.models.length > 0) {
      p.models.forEach((modelId: string) => {
        const displayName =
          formatModelName(modelId, modelMetadata, customModelMetadata) ||
          modelId;

        allModels.push({
          name: `${p.id}:${modelId}`,
          displayName: displayName,
          description: `Model from ${p.name}`,
          providerName: p.name,
        });
      });
    }
  });

  return allModels;
};

export const resolveSelectedModel = (
  availableModels: ModelInfo[],
  selectedModel: string,
  preferredProviderId: string,
): string => {
  if (availableModels.length === 0) return "";

  if (
    selectedModel &&
    availableModels.some((model) => model.name === selectedModel)
  ) {
    return selectedModel;
  }

  const preferredModel = preferredProviderId
    ? availableModels.find((model) =>
        model.name.startsWith(`${preferredProviderId}:`),
      )
    : undefined;

  return preferredModel?.name || availableModels[0].name;
};
