/**
 * API 路由通用工具函数
 * 用于处理 API key 验证、Base URL 处理、流式响应等通用逻辑
 */

import type { GoogleGenAI } from "@google/genai";
import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import {
  ProviderFactory,
  type ProviderConfig as BaseProviderConfig,
} from "../lib/providers/base";
import { logDevError } from "../lib/utils/devLogger";

/**
 * Provider 配置接口
 */
export type ProviderConfig = BaseProviderConfig;

/**
 * 获取有效的 Base URL
 */
export function getEffectiveBaseUrl(
  baseUrl: string | undefined,
  providerType: string,
): string | undefined {
  return ProviderFactory.getEffectiveBaseUrl(baseUrl, providerType);
}

/**
 * 验证并获取 API Key
 */
export function validateAndGetApiKey(provider: ProviderConfig): string {
  return ProviderFactory.validateApiKey(provider);
}

export async function assertProviderOutboundAllowed(
  provider: ProviderConfig,
): Promise<void> {
  await ProviderFactory.assertProviderOutboundAllowed(provider);
}

/**
 * 创建 OpenAI 客户端实例
 */
export function createOpenAIClient(provider: ProviderConfig): OpenAI {
  return ProviderFactory.createOpenAIClient(provider);
}

/**
 * 创建 Anthropic 客户端实例
 */
export function createAnthropicClient(provider: ProviderConfig): Anthropic {
  return ProviderFactory.createAnthropicClient(provider);
}

/**
 * 创建 Google 客户端实例
 */
export function createGoogleClient(provider: ProviderConfig): GoogleGenAI {
  return ProviderFactory.createGoogleClient(provider);
}

export function createGeminiClient(provider: ProviderConfig): GoogleGenAI {
  return createGoogleClient(provider);
}

/**
 * 创建 SSE 流式响应
 */
export function createStreamResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * 创建 SSE 发送函数
 */
export function createSSESender(controller: ReadableStreamDefaultController) {
  const encoder = new TextEncoder();
  return (data: any) => {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  };
}

/**
 * 创建流式处理器
 */
export function createStreamHandler(
  handler: (controller: ReadableStreamDefaultController) => Promise<void>,
): ReadableStream {
  return new ReadableStream({
    async start(controller) {
      try {
        await handler(controller);
        controller.close();
      } catch (error: any) {
        logDevError("[Stream Handler] Error:", error);
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", error: error.message })}\n\n`,
          ),
        );
        controller.close();
      }
    },
  });
}

/**
 * 转换 Schema 为 Gemini 格式
 */
export function convertSchemaToGemini(schema: any): any {
  if (!schema) return undefined;
  const newSchema = { ...schema };
  if (newSchema.type) newSchema.type = newSchema.type.toUpperCase();
  if (newSchema.properties) {
    const newProps: any = {};
    for (const key in newSchema.properties) {
      newProps[key] = convertSchemaToGemini(newSchema.properties[key]);
    }
    newSchema.properties = newProps;
  }
  if (newSchema.items) newSchema.items = convertSchemaToGemini(newSchema.items);
  return newSchema;
}
