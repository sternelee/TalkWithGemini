/**
 * Gemini 流式响应处理器
 */

import {
  GoogleGenAI,
  type GenerateContentParameters,
  type GenerateContentConfig,
} from "@google/genai";
import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import { SSEMessage } from "./sse";
import { finalizeStreamedToolCall } from "./toolCalls";
import { normalizeGeneratedImageAttachment } from "../utils/generatedImages";
import { normalizeSearchSources } from "../search/results";

export interface GeminiStreamOptions {
  client: GoogleGenAI;
  model: string;
  contents: any[];
  systemInstruction?: string;
  temperature?: number;
  tools?: any[];
  enableGoogleSearch?: boolean;
  useReasoning?: boolean;
  onChunk: (message: SSEMessage) => void;
}

function extractGeminiGroundingSources(groundingMetadata: any) {
  const chunks = Array.isArray(groundingMetadata?.groundingChunks)
    ? groundingMetadata.groundingChunks
    : [];
  const supports = Array.isArray(groundingMetadata?.groundingSupports)
    ? groundingMetadata.groundingSupports
    : [];

  const sources = chunks
    .map((chunk: any, index: number) => {
      const web = chunk?.web;
      const uri = web?.uri || web?.url;
      if (!uri) return null;

      const support = supports.find((item: any) => {
        const indexes = item?.groundingChunkIndices;
        return Array.isArray(indexes) ? indexes.includes(index) : index === 0;
      });
      const title = web?.title || uri;
      const content = support?.segment?.text || title;
      return {
        title,
        url: uri,
        content,
      };
    })
    .filter(Boolean);

  return normalizeSearchSources(sources);
}

/**
 * 处理 Gemini 流式响应
 * 注意：由于 Gemini SDK 的限制，这里使用简化的实现
 * 完整的流式处理逻辑保留在原始的 API 路由中
 */
export async function streamGeminiResponse(options: GeminiStreamOptions) {
  const {
    client,
    model: modelName,
    contents,
    systemInstruction,
    temperature = 1,
    tools,
    enableGoogleSearch,
    onChunk,
  } = options;

  const startTime = Date.now();

  // 构建请求参数
  const requestParams: GenerateContentParameters = {
    model: modelName,
    contents,
  };
  const config: GenerateContentConfig = {};

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  if (temperature !== undefined) {
    config.temperature = temperature;
  }

  // Enable thinking mode for reasoning
  if (options.useReasoning) {
    config.thinkingConfig = { includeThoughts: true };
  }

  const geminiTools: NonNullable<GenerateContentConfig["tools"]> = [];
  if (tools && tools.length > 0) {
    geminiTools.push({ functionDeclarations: tools });
  }
  if (enableGoogleSearch) {
    geminiTools.push({ googleSearch: {} });
  }
  if (geminiTools.length > 0) {
    config.tools = geminiTools;
  }

  requestParams.config = config;

  // 调用流式 API
  const stream = await client.models.generateContentStream(requestParams);

  // let fullText = "";
  // let fullReasoning = "";
  let emittedToolCalls = 0;

  for await (const chunk of stream) {
    const candidates = (chunk as any).candidates;

    if (candidates && candidates[0] && candidates[0].content) {
      const candidate = candidates[0];
      const parts = candidate.content.parts;

      for (const part of parts) {
        // 处理思考过程
        if (part.thought && part.text) {
          // fullReasoning += part.text;
          onChunk({ type: "reasoning", content: part.text });
        }
        // 处理工具调用
        else if (part.functionCall) {
          if (
            emittedToolCalls >= PLUGIN_EXECUTION_LIMITS.maxStreamedToolCalls
          ) {
            continue;
          }

          const fc = part.functionCall;
          const toolCall = finalizeStreamedToolCall(
            {
              id: `call_${Date.now()}_${emittedToolCalls}`,
              name: fc.name,
              args: fc.args,
            },
            emittedToolCalls,
          );
          emittedToolCalls += 1;

          if (toolCall) {
            onChunk({
              type: "tool_call",
              toolCall,
            });
          }
        }
        // 处理文本内容
        else if (part.text) {
          // fullText += part.text;
          onChunk({ type: "content", content: part.text });
        }
        // 处理图片
        else if (part.inlineData) {
          const image = normalizeGeneratedImageAttachment({
            id: `img_${Date.now()}`,
            mimeType: part.inlineData.mimeType,
            data: part.inlineData.data,
            fileName: `generated-${Date.now()}.png`,
          });
          if (image) {
            onChunk({
              type: "image",
              image,
            });
          }
        }
      }

      const sources = extractGeminiGroundingSources(
        candidate.groundingMetadata,
      );
      if (sources.length > 0) {
        onChunk({
          type: "search",
          isSearching: false,
          results: { sources, images: [] },
        });
      }
    }

    // 处理使用统计
    if ((chunk as any).usageMetadata) {
      onChunk({
        type: "usage",
        usageMetadata: (chunk as any).usageMetadata,
      });
    }
  }

  // 发送时间统计
  const endTime = Date.now();
  onChunk({
    type: "timing",
    timing: {
      startTime,
      endTime,
      duration: endTime - startTime,
    },
  });
}
