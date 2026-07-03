/**
 * Schema 转换工具
 */

import { FunctionDeclaration } from "@google/genai";

/**
 * 将 OpenAI 格式的 Schema 转换为 Gemini 格式
 */
export function convertSchemaToGemini(
  openAISchema: any,
): FunctionDeclaration["parameters"] {
  if (!openAISchema) return undefined;

  const convert = (schema: any): any => {
    if (!schema || typeof schema !== "object") return schema;

    const result: any = {};

    if (schema.type) result.type = schema.type.toUpperCase();
    if (schema.description) result.description = schema.description;
    if (schema.enum) result.enum = schema.enum;

    if (schema.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = convert(value);
      }
    }

    if (schema.items) {
      result.items = convert(schema.items);
    }

    if (schema.required) {
      result.required = schema.required;
    }

    return result;
  };

  return convert(openAISchema);
}

/**
 * 将 Gemini 格式的工具转换为 OpenAI 格式
 */
export function convertGeminiToolsToOpenAI(geminiTools: any[]): any[] {
  return geminiTools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: convertGeminiSchemaToOpenAI(tool.parameters),
    },
  }));
}

/**
 * 将 Gemini Schema 转换为 OpenAI 格式
 */
function convertGeminiSchemaToOpenAI(geminiSchema: any): any {
  if (!geminiSchema) return {};

  const convert = (schema: any): any => {
    if (!schema || typeof schema !== "object") return schema;

    const result: any = {};

    if (schema.type) {
      result.type = schema.type.toLowerCase();
    }

    if (schema.description) result.description = schema.description;
    if (schema.enum) result.enum = schema.enum;

    if (schema.properties) {
      result.properties = {};
      for (const [key, value] of Object.entries(schema.properties)) {
        result.properties[key] = convert(value);
      }
    }

    if (schema.items) {
      result.items = convert(schema.items);
    }

    if (schema.required) {
      result.required = schema.required;
    }

    return result;
  };

  return convert(geminiSchema);
}
