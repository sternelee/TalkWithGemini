import type { Plugin } from "../../types";

export const AGNES_IMAGE_PLUGIN_ID = "agnes-image-generation";
export const AGNES_VIDEO_PLUGIN_ID = "agnes-video-generation";
export const GEMINI_IMAGE_PLUGIN_ID = "gemini-image-generation";
export const OPENAI_IMAGE_PLUGIN_ID = "openai-image-generation";
export const OPENAI_RESPONSES_IMAGE_PLUGIN_ID =
  "openai-responses-image-processing";

type AgnesVideoGenerationStatus = "generating" | "generated" | "failed";

interface NormalizedPluginImage {
  imageUrl: string | null;
  imageBase64: string | null;
  mimeType: string;
  revisedPrompt?: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getAgnesVideoUrl(
  responseData: Record<string, unknown>,
): string | null {
  if (
    typeof responseData.remixed_from_video_id === "string" &&
    responseData.remixed_from_video_id.trim()
  ) {
    return responseData.remixed_from_video_id;
  }

  if (
    typeof responseData.video_url === "string" &&
    responseData.video_url.trim()
  ) {
    return responseData.video_url;
  }

  return null;
}

function hasAgnesVideoError(responseData: Record<string, unknown>): boolean {
  return (
    responseData.error !== undefined &&
    responseData.error !== null &&
    responseData.error !== ""
  );
}

function getAgnesVideoGenerationStatus(
  responseData: Record<string, unknown>,
): AgnesVideoGenerationStatus {
  const status =
    typeof responseData.status === "string"
      ? responseData.status.toLowerCase()
      : "";

  if (
    hasAgnesVideoError(responseData) ||
    ["failed", "error", "cancelled", "canceled"].includes(status)
  ) {
    return "failed";
  }

  if (getAgnesVideoUrl(responseData) || status === "completed") {
    return "generated";
  }

  return "generating";
}

function normalizeAgnesVideoResult(responseData: Record<string, unknown>) {
  const videoUrl = getAgnesVideoUrl(responseData);

  return {
    taskId:
      typeof responseData.task_id === "string"
        ? responseData.task_id
        : typeof responseData.id === "string"
          ? responseData.id
          : null,
    videoId:
      typeof responseData.video_id === "string" ? responseData.video_id : null,
    status:
      typeof responseData.status === "string" ? responseData.status : null,
    generationStatus: getAgnesVideoGenerationStatus(responseData),
    progress:
      typeof responseData.progress === "number" ? responseData.progress : null,
    seconds:
      typeof responseData.seconds === "string" ||
      typeof responseData.seconds === "number"
        ? responseData.seconds
        : null,
    size: typeof responseData.size === "string" ? responseData.size : null,
    videoUrl,
    error: responseData.error === undefined ? null : responseData.error,
    raw: responseData,
  };
}

function getStringField(
  record: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : null;
}

function normalizeImageResult(
  responseData: unknown,
  images: NormalizedPluginImage[],
) {
  const first = images[0];
  return {
    imageUrl: first?.imageUrl ?? null,
    imageBase64: first?.imageBase64 ?? null,
    revisedPrompt: first?.revisedPrompt ?? null,
    images,
    raw: responseData,
  };
}

function normalizeOpenAIImageDataResponse(
  responseData: Record<string, unknown>,
) {
  const data = Array.isArray(responseData.data) ? responseData.data : [];
  const images = data.filter(isRecord).map((item) => ({
    imageUrl: getStringField(item, "url"),
    imageBase64: getStringField(item, "b64_json"),
    mimeType: "image/png",
    revisedPrompt: getStringField(item, "revised_prompt"),
  }));

  return normalizeImageResult(responseData, images);
}

function normalizeOpenAIResponsesImageResponse(
  responseData: Record<string, unknown>,
) {
  const output = Array.isArray(responseData.output) ? responseData.output : [];
  const images = output
    .filter(
      (item): item is Record<string, unknown> =>
        isRecord(item) && item.type === "image_generation_call",
    )
    .map((item) => ({
      imageUrl: null,
      imageBase64: getStringField(item, "result"),
      mimeType: "image/png",
      revisedPrompt: getStringField(item, "revised_prompt"),
    }))
    .filter((image) => image.imageBase64 || image.imageUrl);

  return normalizeImageResult(responseData, images);
}

function extractGeminiImageContent(value: unknown): NormalizedPluginImage[] {
  if (!isRecord(value)) return [];

  if (value.type === "image") {
    const imageBase64 = getStringField(value, "data");
    const imageUrl = getStringField(value, "uri");
    if (imageBase64 || imageUrl) {
      return [
        {
          imageUrl,
          imageBase64,
          mimeType: getStringField(value, "mime_type") || "image/png",
        },
      ];
    }
  }

  const images: NormalizedPluginImage[] = [];
  for (const item of Object.values(value)) {
    if (Array.isArray(item)) {
      for (const child of item) {
        images.push(...extractGeminiImageContent(child));
      }
    } else if (isRecord(item)) {
      images.push(...extractGeminiImageContent(item));
    }
  }
  return images;
}

function normalizeGeminiInteractionImageResponse(
  responseData: Record<string, unknown>,
) {
  const outputImage = responseData.output_image;
  const images = isRecord(outputImage)
    ? extractGeminiImageContent({ type: "image", ...outputImage })
    : extractGeminiImageContent(responseData);

  return normalizeImageResult(responseData, images);
}

export function normalizePluginResponse(
  plugin: Plugin,
  responseData: unknown,
): unknown {
  if (
    plugin.id === "jina-web-reader" &&
    isRecord(responseData) &&
    responseData.code === 200 &&
    isRecord(responseData.data) &&
    typeof responseData.data.content === "string"
  ) {
    return responseData.data.content;
  }

  if (
    plugin.id === AGNES_IMAGE_PLUGIN_ID &&
    isRecord(responseData) &&
    Array.isArray(responseData.data)
  ) {
    const normalized = normalizeOpenAIImageDataResponse(responseData);
    return {
      imageUrl: normalized.imageUrl,
      imageBase64: normalized.imageBase64,
      revisedPrompt: normalized.revisedPrompt,
      raw: normalized.raw,
    };
  }

  if (plugin.id === GEMINI_IMAGE_PLUGIN_ID && isRecord(responseData)) {
    return normalizeGeminiInteractionImageResponse(responseData);
  }

  if (
    plugin.id === OPENAI_RESPONSES_IMAGE_PLUGIN_ID &&
    isRecord(responseData)
  ) {
    if (Array.isArray(responseData.output)) {
      return normalizeOpenAIResponsesImageResponse(responseData);
    }
  }

  if (plugin.id === OPENAI_IMAGE_PLUGIN_ID && isRecord(responseData)) {
    if (Array.isArray(responseData.data)) {
      return normalizeOpenAIImageDataResponse(responseData);
    }
  }

  if (plugin.id === AGNES_VIDEO_PLUGIN_ID && isRecord(responseData)) {
    return normalizeAgnesVideoResult(responseData);
  }

  return responseData;
}
