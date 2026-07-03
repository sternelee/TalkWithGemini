import type { Plugin } from "../../types";

export const AGNES_IMAGE_PLUGIN_ID = "agnes-image-generation";
export const AGNES_VIDEO_PLUGIN_ID = "agnes-video-generation";

type AgnesVideoGenerationStatus = "generating" | "generated" | "failed";

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
    const firstResult = responseData.data.find(isRecord);
    return {
      imageUrl:
        firstResult && typeof firstResult.url === "string"
          ? firstResult.url
          : null,
      imageBase64:
        firstResult && typeof firstResult.b64_json === "string"
          ? firstResult.b64_json
          : null,
      revisedPrompt:
        firstResult && typeof firstResult.revised_prompt === "string"
          ? firstResult.revised_prompt
          : null,
      raw: responseData,
    };
  }

  if (plugin.id === AGNES_VIDEO_PLUGIN_ID && isRecord(responseData)) {
    return normalizeAgnesVideoResult(responseData);
  }

  return responseData;
}
