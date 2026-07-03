/**
 * 统一的聊天处理器
 */

import { Message } from "@/types";
import { ProviderFactory, ProviderConfig } from "../providers/base";
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
  prepareOpenAIHistory,
  prepareOpenAIResponsesInput,
} from "../utils/history";
import { convertAttachmentsToOpenAIResponses } from "../utils/attachments";
import { convertSchemaToGemini } from "../utils/schema";
import { logDevWarn } from "../utils/devLogger";
import {
  isOpenAIProviderType,
  OPENAI_COMPATIBLE_PROVIDER_TYPE,
} from "../providers/providerTypes";

export interface ChatHandlerOptions {
  provider: ProviderConfig;
  modelName: string;
  history: Message[];
  newMessage: string;
  attachments?: any[];
  config?: {
    temperature?: number;
    useReasoning?: boolean;
  };
  systemInstruction?: string;
  tools?: any[];
  enableGoogleSearch?: boolean;
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
    enableGoogleSearch,
  } = options;

  const stream = createStreamHandler(async (controller) => {
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
        instructions: systemInstruction,
        temperature: config?.temperature,
        tools: convertToolsToOpenAIResponses(tools),
        useReasoning: config?.useReasoning,
        onChunk: send,
      });
    } else if (provider.type === OPENAI_COMPATIBLE_PROVIDER_TYPE) {
      await ProviderFactory.assertProviderOutboundAllowed(provider);
      const client = ProviderFactory.createOpenAIClient(provider);
      const messages = prepareOpenAIHistory(history);

      // 添加新消息
      const content: any[] = [{ type: "text", text: newMessage }];
      if (attachments?.length) {
        // 转换附件格式
        content.push(...attachments);
      }
      messages.push({ role: "user", content });

      // 添加系统指令
      if (systemInstruction) {
        messages.unshift({ role: "system", content: systemInstruction });
      }

      await streamOpenAIChatCompletions({
        client,
        model: modelName,
        messages,
        temperature: config?.temperature,
        tools,
        useReasoning: config?.useReasoning,
        onChunk: send,
      });
    } else {
      // Gemini
      await ProviderFactory.assertProviderOutboundAllowed(provider);
      const client = ProviderFactory.createGeminiClient(provider);
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
        useReasoning: config?.useReasoning,
        onChunk: send,
      });
    }

    send({ type: "done" });
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
  } else {
    const client = ProviderFactory.createGeminiClient(provider);
    const result = await client.models.generateContent({
      model: modelName,
      contents: { parts: [{ text: prompt }] },
    });
    return result.text || "";
  }
}
