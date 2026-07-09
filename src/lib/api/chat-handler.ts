/**
 * 统一的聊天处理器
 */

import type { Message, ReasoningMode } from "@/types";
import { ProviderFactory, ProviderConfig } from "../providers/base";
import {
  createAnthropicMessageText,
  convertToolsToAnthropic,
  streamAnthropicMessages,
} from "../streaming/anthropic";
import { streamGeminiResponse } from "../streaming/gemini";
import {
  streamOpenAIChatCompletions,
  streamOpenAIResponses,
} from "../streaming/openai";
import {
  createStreamHandler,
  createStreamResponse,
  createSSESender,
} from "../streaming/sse";
import {
  prepareGeminiHistory,
  prepareAnthropicMessages,
  prepareOpenAIHistory,
  prepareOpenAIResponsesInput,
} from "../utils/history";
import {
  convertAttachmentsToAnthropic,
  convertAttachmentsToOpenAI,
  convertAttachmentsToOpenAIResponses,
} from "../utils/attachments";
import { convertSchemaToGemini } from "../utils/schema";
import { logDevWarn } from "../utils/devLogger";
import {
  isOpenAIProviderType,
  isAnthropicProviderType,
  isGoogleProviderType,
  OPENAI_COMPATIBLE_PROVIDER_TYPE,
} from "../providers/providerTypes";
import { safeServerLogError } from "../utils/safeServerLog";

export interface ChatHandlerOptions {
  provider: ProviderConfig;
  modelName: string;
  history: Message[];
  newMessage: string;
  attachments?: any[];
  config?: {
    temperature?: number;
    useReasoning?: boolean;
    reasoningMode?: ReasoningMode;
    imageCount?: number;
  };
  systemInstruction?: string;
  tools?: any[];
  enableImageGeneration?: boolean;
  enableGoogleSearch?: boolean;
  enableOpenAIWebSearch?: boolean;
}

function getProviderBaseUrlHost(provider: ProviderConfig): string | undefined {
  const baseUrl = getProviderBaseUrl(provider);
  if (!baseUrl) return undefined;

  try {
    return new URL(baseUrl).hostname;
  } catch {
    return undefined;
  }
}

function getProviderBaseUrl(provider: ProviderConfig): string | undefined {
  return ProviderFactory.getEffectiveBaseUrl(provider.baseUrl, provider.type);
}

function getErrorStringField(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getErrorNumberField(
  record: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function getChatStreamErrorDetails(error: unknown) {
  const record =
    error && typeof error === "object"
      ? (error as Record<string, unknown>)
      : {};

  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    status:
      getErrorNumberField(record, "status") ||
      getErrorNumberField(record, "statusCode"),
    code: getErrorStringField(record, "code"),
    type: getErrorStringField(record, "type"),
  };
}

function logChatStreamError(error: unknown, options: ChatHandlerOptions): void {
  safeServerLogError("Chat stream error:", {
    providerType: options.provider.type,
    providerBaseUrlHost: getProviderBaseUrlHost(options.provider),
    modelName: options.modelName,
    error: getChatStreamErrorDetails(error),
  });
}

function convertToolsToOpenAIResponses(tools?: any[]) {
  return tools
    ?.map((tool) => {
      const fn = tool?.function;
      if (tool?.type !== "function" || !fn?.name) return null;
      return {
        type: "function",
        name: fn.name,
        description: fn.description,
        parameters: fn.parameters || { type: "object", properties: {} },
        strict: false,
      };
    })
    .filter(Boolean);
}

function getResponsesOutputText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;

  const output = Array.isArray(response?.output) ? response.output : [];
  return output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((content: any) =>
      typeof content?.text === "string" ? content.text : "",
    )
    .join("");
}

function appendImageCountInstruction(
  instruction: string | undefined,
  imageCount: number | undefined,
): string | undefined {
  if (!imageCount) return instruction;

  const imageInstruction = `When generating images for this request, create ${imageCount} separate image output${imageCount === 1 ? "" : "s"}.`;
  return instruction
    ? `${instruction}\n\n${imageInstruction}`
    : imageInstruction;
}

/**
 * 处理聊天请求（流式）
 */
export async function handleChatStream(options: ChatHandlerOptions) {
  const {
    provider,
    modelName,
    history,
    newMessage,
    attachments,
    config,
    systemInstruction,
    tools,
    enableImageGeneration,
    enableGoogleSearch,
    enableOpenAIWebSearch,
  } = options;

  const stream = createStreamHandler(async (controller) => {
    try {
      const send = createSSESender(controller);

      if (provider.type === "OpenAI") {
        await ProviderFactory.assertProviderOutboundAllowed(provider);
        const client = ProviderFactory.createOpenAIClient(provider);
        const input = prepareOpenAIResponsesInput(history);

        const content: any[] = [{ type: "input_text", text: newMessage }];
        if (attachments?.length) {
          content.push(...convertAttachmentsToOpenAIResponses(attachments));
        }
        input.push({ role: "user", content });

        await streamOpenAIResponses({
          client,
          model: modelName,
          input,
          instructions: appendImageCountInstruction(
            systemInstruction,
            enableImageGeneration ? config?.imageCount : undefined,
          ),
          temperature: config?.temperature,
          tools: convertToolsToOpenAIResponses(tools),
          useReasoning: config?.useReasoning,
          reasoningMode: config?.reasoningMode,
          enableImageGeneration,
          enableWebSearch: enableOpenAIWebSearch,
          onChunk: send,
        });
      } else if (provider.type === OPENAI_COMPATIBLE_PROVIDER_TYPE) {
        await ProviderFactory.assertProviderOutboundAllowed(provider);
        const messages = prepareOpenAIHistory(history);

        // 添加新消息
        const content: any[] = [{ type: "text", text: newMessage }];
        if (attachments?.length) {
          // 转换附件格式
          content.push(...convertAttachmentsToOpenAI(attachments));
        }
        messages.push({ role: "user", content });

        // 添加系统指令
        if (systemInstruction) {
          messages.unshift({ role: "system", content: systemInstruction });
        }

        const client = ProviderFactory.createOpenAIClient(provider);
        await streamOpenAIChatCompletions({
          client,
          model: modelName,
          messages,
          temperature: config?.temperature,
          tools,
          useReasoning: config?.useReasoning,
          reasoningMode: config?.reasoningMode,
          onChunk: send,
        });
      } else if (isAnthropicProviderType(provider.type)) {
        await ProviderFactory.assertProviderOutboundAllowed(provider);
        const client = ProviderFactory.createAnthropicClient(provider);
        const messages = prepareAnthropicMessages(history);
        const content: any[] = [];
        if (newMessage) content.push({ type: "text", text: newMessage });
        if (attachments?.length) {
          content.push(...convertAttachmentsToAnthropic(attachments));
        }
        messages.push({
          role: "user",
          content: content.length > 0 ? content : " ",
        });

        await streamAnthropicMessages({
          client,
          model: modelName,
          messages,
          system: systemInstruction,
          temperature: config?.temperature,
          tools: convertToolsToAnthropic(tools),
          useReasoning: config?.useReasoning,
          reasoningMode: config?.reasoningMode,
          onChunk: send,
        });
      } else if (isGoogleProviderType(provider.type)) {
        // Google
        await ProviderFactory.assertProviderOutboundAllowed(provider);
        const client = ProviderFactory.createGoogleClient(provider);
        const contents = prepareGeminiHistory(history);

        // 添加新消息
        const parts: any[] = [{ text: newMessage }];
        if (attachments?.length) {
          // 转换附件为 Gemini 格式
          const geminiAttachments = attachments
            .map((att: any) => {
              // 如果已经是正确的 Gemini 格式
              if (att.fileData) {
                return att;
              }
              if (att.inlineData) {
                return att;
              }

              // 转换原始附件对象
              if (att.url && !att.data) {
                // 远程文件
                return {
                  fileData: {
                    mimeType: att.mimeType,
                    fileUri: att.url,
                  },
                };
              }

              if (att.data) {
                // Base64 数据
                return {
                  inlineData: {
                    mimeType: att.mimeType,
                    data: att.data,
                  },
                };
              }

              // 如果既没有 url 也没有 data，跳过这个附件
              logDevWarn("Skipping invalid attachment:", {
                fileName: att.fileName,
                mimeType: att.mimeType,
              });
              return null;
            })
            .filter(Boolean); // 过滤掉 null 值

          parts.push(...geminiAttachments);
        }
        contents.push({ role: "user", parts });

        // 转换工具格式
        const geminiTools = tools?.map((tool: any) => ({
          name: tool.function.name,
          description: tool.function.description,
          parameters: convertSchemaToGemini(tool.function.parameters),
        }));

        await streamGeminiResponse({
          client,
          model: modelName,
          contents,
          systemInstruction,
          temperature: config?.temperature,
          tools: geminiTools,
          enableGoogleSearch,
          enableImageGeneration,
          imageCount: config?.imageCount,
          useReasoning: config?.useReasoning,
          reasoningMode: config?.reasoningMode,
          onChunk: send,
        });
      } else {
        throw new Error(`Unsupported provider type: ${provider.type}`);
      }

      send({ type: "done" });
    } catch (error) {
      logChatStreamError(error, options);
      throw error;
    }
  });

  return createStreamResponse(stream);
}

/**
 * 简单的文本生成（用于标题、问题等）
 */
export async function handleSimpleGeneration(
  provider: ProviderConfig,
  modelName: string,
  prompt: string,
): Promise<string> {
  await ProviderFactory.assertProviderOutboundAllowed(provider);

  if (provider.type === "OpenAI") {
    const client = ProviderFactory.createOpenAIClient(provider);
    const response = await client.responses.create({
      model: modelName,
      input: prompt,
      temperature: 0.7,
    });
    return getResponsesOutputText(response);
  }

  if (isOpenAIProviderType(provider.type)) {
    const client = ProviderFactory.createOpenAIClient(provider);
    const response = await client.chat.completions.create({
      model: modelName,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });
    return response.choices[0]?.message?.content || "";
  }

  if (isAnthropicProviderType(provider.type)) {
    const client = ProviderFactory.createAnthropicClient(provider);
    return createAnthropicMessageText({
      client,
      model: modelName,
      prompt,
    });
  }

  if (isGoogleProviderType(provider.type)) {
    const client = ProviderFactory.createGoogleClient(provider);
    const result = await client.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: prompt }] },
    });
    return result.text || "";
  }

  throw new Error(`Unsupported provider type: ${provider.type}`);
}
