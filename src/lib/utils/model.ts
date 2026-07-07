/**
 * 模型能力检测工具
 */

import { ModelMetadata } from "@/types";

/**
 * 解析模型字符串（格式：providerId:modelName）
 */
export function parseModelString(modelString: string): {
  providerId?: string;
  modelName: string;
} {
  const separatorIndex = modelString.indexOf(":");
  if (separatorIndex > 0) {
    const providerId = modelString.slice(0, separatorIndex);
    const modelName = modelString.slice(separatorIndex + 1);
    if (modelName) {
      return { providerId, modelName };
    }
  }

  return { modelName: modelString };
}

/**
 * 检查模型是否支持附件
 */
export function supportsAttachments(metadata?: ModelMetadata): boolean {
  return metadata?.attachment === true;
}

/**
 * 检查模型是否支持推理
 */
export function supportsReasoning(metadata?: ModelMetadata): boolean {
  return metadata?.reasoning === true;
}

/**
 * 检查模型是否支持工具调用
 */
export function supportsToolCalls(metadata?: ModelMetadata): boolean {
  return metadata?.tool_call === true;
}

/**
 * 检查模型是否支持温度参数
 */
export function supportsTemperature(metadata?: ModelMetadata): boolean {
  return metadata?.temperature !== false;
}

/**
 * 检查模型是否支持结构化输出
 */
export function supportsStructuredOutput(metadata?: ModelMetadata): boolean {
  return metadata?.structured_output === true;
}

function normalizeModality(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * 获取模型的上下文窗口大小
 */
export function getContextWindow(metadata?: ModelMetadata): number {
  return metadata?.limit?.context || 128000; // 默认 128k
}

/**
 * 获取模型的最大输出长度
 */
export function getMaxOutputTokens(metadata?: ModelMetadata): number {
  return metadata?.limit?.output || 8192; // 默认 8k
}

/**
 * 检查模型是否支持指定的模态
 */
export function supportsModality(
  metadata: ModelMetadata | undefined,
  modality: string,
  direction: "input" | "output",
): boolean {
  const modalities = metadata?.modalities?.[direction];
  const target = normalizeModality(modality);
  return (
    modalities?.some((item) => normalizeModality(item) === target) ?? false
  );
}

export function supportsTextOutput(metadata?: ModelMetadata): boolean {
  if (!metadata?.modalities?.output?.length) return true;
  return supportsModality(metadata, "text", "output");
}

export function supportsImageGeneration(metadata?: ModelMetadata): boolean {
  return supportsModality(metadata, "image", "output");
}

export function supportsImageEditing(metadata?: ModelMetadata): boolean {
  return (
    supportsModality(metadata, "image", "input") &&
    supportsImageGeneration(metadata)
  );
}
