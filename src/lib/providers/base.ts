/**
 * Provider 基础抽象层
 */

import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { AuthenticationError } from "../errors";
import {
  getProviderAnthropicSdkBaseUrl,
  getProviderApiKey,
  getProviderGoogleSdkOptions,
  normalizeProviderBaseUrl,
  ProviderRuntimeConfig,
  validateOutboundUrl,
  getSafeUrlPolicy,
} from "../security/urlPolicy";
import { assertOutboundUrlAllowed, safeFetch } from "../security/safeFetch";
import {
  isAnthropicProviderType,
  isGoogleProviderType,
  isOpenAIProviderType,
} from "./providerTypes";

export type ProviderConfig = ProviderRuntimeConfig;

export interface StreamSender {
  (data: any): void;
}

type ProviderFetch = typeof fetch;

interface GoogleApiClientWithFetch {
  apiClient?: {
    apiCall?: (url: string, requestInit: RequestInit) => Promise<Response>;
  };
}

function toSafeFetchRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): { url: string | URL; init?: RequestInit } {
  const request = input instanceof Request ? input : null;
  if (!request) return { url: input as string | URL, init };

  return {
    url: request.url,
    init: {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: request.signal,
      ...init,
    },
  };
}

function createProviderFetch(): ProviderFetch {
  return async (input, init) => {
    const request = toSafeFetchRequest(input, init);
    return safeFetch(request.url, request.init, {
      policy: getSafeUrlPolicy("provider"),
    });
  };
}

function installGoogleProviderFetch(client: GoogleGenAI): GoogleGenAI {
  const apiClient = (client as unknown as GoogleApiClientWithFetch).apiClient;
  if (!apiClient?.apiCall) return client;

  const providerFetch = createProviderFetch();
  apiClient.apiCall = (url, requestInit) => providerFetch(url, requestInit);
  return client;
}

/**
 * Provider 工厂类
 */
export class ProviderFactory {
  /**
   * 获取有效的 Base URL
   */
  static getEffectiveBaseUrl(
    baseUrl: string | undefined,
    providerType: string,
  ): string | undefined {
    return normalizeProviderBaseUrl(baseUrl, providerType);
  }

  /**
   * 验证并获取 API Key
   */
  static validateApiKey(provider: ProviderConfig): string {
    const apiKey = getProviderApiKey(provider);

    if (!apiKey.trim()) {
      throw new AuthenticationError(
        `${provider.type} API key is not configured. Please add your API key in Settings.`,
      );
    }

    return apiKey;
  }

  static async assertProviderOutboundAllowed(
    provider: ProviderConfig,
  ): Promise<void> {
    const baseUrl = this.getEffectiveBaseUrl(provider.baseUrl, provider.type);
    if (!baseUrl) return;

    await assertOutboundUrlAllowed(baseUrl, {
      policy: getSafeUrlPolicy("provider"),
      timeoutMs: 10_000,
    });
  }

  /**
   * 创建 OpenAI 客户端
   */
  static createOpenAIClient(provider: ProviderConfig): OpenAI {
    const apiKey = this.validateApiKey(provider);
    const baseURL = this.getEffectiveBaseUrl(provider.baseUrl, provider.type);
    if (baseURL) {
      validateOutboundUrl(baseURL, getSafeUrlPolicy("provider"));
    }

    return new OpenAI({ apiKey, baseURL, fetch: createProviderFetch() });
  }

  /**
   * 创建 Anthropic 客户端
   */
  static createAnthropicClient(provider: ProviderConfig): Anthropic {
    const apiKey = this.validateApiKey(provider);
    const baseURL = getProviderAnthropicSdkBaseUrl(provider.baseUrl);
    validateOutboundUrl(baseURL, getSafeUrlPolicy("provider"));

    return new Anthropic({
      apiKey,
      baseURL,
      fetch: createProviderFetch(),
    });
  }

  /**
   * 创建 Google 客户端
   */
  static createGoogleClient(provider: ProviderConfig): GoogleGenAI {
    const apiKey = this.validateApiKey(provider);
    const { baseUrl, apiVersion } = getProviderGoogleSdkOptions(
      provider.baseUrl,
    );
    if (baseUrl) {
      validateOutboundUrl(baseUrl, getSafeUrlPolicy("provider"));
    }

    return installGoogleProviderFetch(
      new GoogleGenAI({
        apiKey,
        httpOptions: { baseUrl, apiVersion },
      }),
    );
  }

  static createGeminiClient(provider: ProviderConfig): GoogleGenAI {
    return this.createGoogleClient(provider);
  }

  /**
   * 创建客户端（自动选择类型）
   */
  static createClient(
    provider: ProviderConfig,
  ): OpenAI | Anthropic | GoogleGenAI {
    if (isOpenAIProviderType(provider.type)) {
      return this.createOpenAIClient(provider);
    }
    if (isAnthropicProviderType(provider.type)) {
      return this.createAnthropicClient(provider);
    }
    if (isGoogleProviderType(provider.type)) {
      return this.createGoogleClient(provider);
    }
    throw new Error(`Unsupported provider type: ${provider.type}`);
  }
}
