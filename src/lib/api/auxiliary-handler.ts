/**
 * 辅助功能处理器
 * 用于标题生成、相关问题、RAG 查询等
 */

import type { Message } from "../../types";
import { API_INPUT_LIMITS, AUXILIARY_OUTPUT_LIMITS } from "../../config/limits";
import { handleSimpleGeneration } from "./chat-handler";
import { ProviderConfig } from "../providers/base";
import { normalizeSessionTitle } from "../chat/entities";
import { logDevError } from "../utils/devLogger";

function clipForAuxiliaryPrompt(text: string): string {
  return text.slice(0, API_INPUT_LIMITS.maxAuxiliaryPromptContextChars);
}

function stripListMarker(value: string): string {
  return value
    .replace(/^\s*(?:[-*•]\s+|\d+[\.)]\s*)/, "")
    .replace(/^["']|["']$/g, "")
    .trim();
}

function normalizeAuxiliaryStringList(
  values: unknown[],
  options: { maxItems: number; maxChars: number },
): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    if (typeof value !== "string") continue;

    const item = stripListMarker(value).slice(0, options.maxChars).trim();
    if (!item) continue;

    const key = item.toLocaleLowerCase();
    if (seen.has(key)) continue;

    normalized.push(item);
    seen.add(key);

    if (normalized.length >= options.maxItems) break;
  }

  return normalized;
}

function parseAuxiliaryStringList(
  result: string,
  options: { maxItems: number; maxChars: number },
): string[] {
  let cleanedResult = result.trim();

  cleanedResult = cleanedResult.replace(/^```(?:json)?\s*\n?/i, "");
  cleanedResult = cleanedResult.replace(/\n?```\s*$/, "");
  cleanedResult = cleanedResult.trim();

  try {
    const parsed = JSON.parse(cleanedResult);
    if (Array.isArray(parsed)) {
      return normalizeAuxiliaryStringList(parsed, options);
    }
  } catch {
    // Fallback to line-by-line parsing below.
  }

  return normalizeAuxiliaryStringList(cleanedResult.split("\n"), options);
}

/**
 * 生成聊天标题
 */
export async function generateTitle(
  provider: ProviderConfig,
  modelName: string,
  history: Message[],
): Promise<string> {
  const firstUserMsg = history.find((m) => m.role === "user");
  const firstModelMsg = history.find((m) => m.role === "model");

  if (!firstUserMsg) return "New Chat";

  const userMsg = clipForAuxiliaryPrompt(firstUserMsg.content);
  const modelMsg = firstModelMsg
    ? clipForAuxiliaryPrompt(firstModelMsg.content)
    : "";

  // Optimized prompt for better title generation
  const prompt = `Summarize the following conversation into a short, concise title (3-6 words).
Do not use quotes.
The generated title needs to use the same language as the user's question.

User: "${userMsg}"
AI: "${modelMsg}"

Title:`;

  try {
    const result = await handleSimpleGeneration(provider, modelName, prompt);
    return normalizeSessionTitle(result);
  } catch (e) {
    logDevError("Error generating title:", e);
    return normalizeSessionTitle(firstUserMsg.content);
  }
}

/**
 * 生成相关问题
 */
export async function generateRelatedQuestions(
  provider: ProviderConfig,
  modelName: string,
  history: Message[],
): Promise<string[]> {
  // Get last 2 turns (User and Model)
  const recentHistory = history.slice(-2);
  if (recentHistory.length < 2) return [];

  const lastUserMsg = recentHistory.find((m) => m.role === "user");
  const lastModelMsg = recentHistory.find((m) => m.role === "model");

  if (!lastUserMsg || !lastModelMsg) return [];

  const prompt = `Based on the following conversation, suggest 3 to 5 related follow-up questions the user might want to ask.
Each question must be short (less than 24 words).
Return the result as a JSON array of strings.

User: "${clipForAuxiliaryPrompt(lastUserMsg.content)}"
Model: "${clipForAuxiliaryPrompt(lastModelMsg.content)}"`;

  const result = await handleSimpleGeneration(provider, modelName, prompt);
  return parseAuxiliaryStringList(result, {
    maxItems: AUXILIARY_OUTPUT_LIMITS.maxRelatedQuestions,
    maxChars: AUXILIARY_OUTPUT_LIMITS.maxRelatedQuestionChars,
  });
}

/**
 * 生成 RAG 查询
 */
export async function generateRAGQueries(
  provider: ProviderConfig,
  modelName: string,
  userMessage: string,
): Promise<string[]> {
  const clippedUserMessage = clipForAuxiliaryPrompt(userMessage);
  const prompt = `Generate 2-3 search queries to find relevant information for this question:

"${clippedUserMessage}"

Return only the queries, one per line.`;

  const result = await handleSimpleGeneration(provider, modelName, prompt);
  return parseAuxiliaryStringList(result, {
    maxItems: AUXILIARY_OUTPUT_LIMITS.maxRagQueries,
    maxChars: AUXILIARY_OUTPUT_LIMITS.maxRagQueryChars,
  });
}
