import { PLUGIN_EXECUTION_LIMITS } from "../../config/limits";
import type { EncryptedSecretEnvelope } from "../byok/shared";
import type { Plugin, PluginFunction } from "../../types";

export interface PluginExecutionAuthConfig {
  type?: "bearer" | "apiKey" | "none" | "oauth2";
  value?: string;
  valueSecret?: EncryptedSecretEnvelope;
  key?: string;
  addTo?: "header" | "query";
  baseUrl?: string;
  model?: string;
}

export interface PluginExecutionPayload {
  plugin: Plugin;
  functionDef: PluginFunction;
  args: Record<string, unknown>;
  authConfig?: PluginExecutionAuthConfig;
}

export interface PluginExecutionRequestPayload {
  pluginId: string;
  functionName: string;
  args: Record<string, unknown>;
  authConfig?: PluginExecutionAuthConfig;
  callId?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function getPluginExecutionFunctionNameError(
  name: unknown,
): string | null {
  if (typeof name !== "string" || !name.trim()) {
    return "Plugin function name is missing.";
  }

  if (name.length > PLUGIN_EXECUTION_LIMITS.maxFunctionNameChars) {
    return "Plugin function name is too long.";
  }

  return null;
}

function getJsonCompatibilityError(value: unknown): string | null {
  const seen = new WeakSet<object>();
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let entries = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    const { value: currentValue, depth } = current;

    if (currentValue === null) continue;

    switch (typeof currentValue) {
      case "string":
      case "boolean":
        continue;
      case "number":
        if (!Number.isFinite(currentValue)) {
          return "Plugin arguments must not contain non-finite numbers.";
        }
        continue;
      case "bigint":
      case "function":
      case "symbol":
      case "undefined":
        return "Plugin arguments contain values that cannot be serialized as JSON.";
      case "object":
        break;
      default:
        return "Plugin arguments contain unsupported values.";
    }

    if (depth >= PLUGIN_EXECUTION_LIMITS.maxArgDepth) {
      return "Plugin arguments are too deeply nested.";
    }

    if (seen.has(currentValue)) {
      return "Plugin arguments must not contain circular references.";
    }
    seen.add(currentValue);

    if (!Array.isArray(currentValue) && !isPlainObject(currentValue)) {
      return "Plugin arguments must contain only JSON objects and arrays.";
    }

    const childValues = Array.isArray(currentValue)
      ? currentValue
      : Object.values(currentValue as Record<string, unknown>);
    entries += childValues.length;

    if (entries > PLUGIN_EXECUTION_LIMITS.maxArgEntries) {
      return "Plugin arguments contain too many values.";
    }

    for (const childValue of childValues) {
      stack.push({ value: childValue, depth: depth + 1 });
    }
  }

  return null;
}

export function getPluginExecutionArgsError(args: unknown): string | null {
  if (!isRecord(args)) {
    return "Plugin arguments must be a JSON object.";
  }

  const compatibilityError = getJsonCompatibilityError(args);
  if (compatibilityError) return compatibilityError;

  const serialized = JSON.stringify(args);
  if (serialized.length > PLUGIN_EXECUTION_LIMITS.maxArgsJsonChars) {
    return "Plugin arguments are too large to execute safely.";
  }

  return null;
}

export function serializePluginExecutionPayload(
  payload: PluginExecutionPayload | PluginExecutionRequestPayload,
): string {
  const functionName =
    "functionDef" in payload ? payload.functionDef.name : payload.functionName;
  const nameError = getPluginExecutionFunctionNameError(functionName);
  if (nameError) throw new Error(nameError);

  const argsError = getPluginExecutionArgsError(payload.args);
  if (argsError) throw new Error(argsError);

  let serialized: string;
  try {
    serialized = JSON.stringify(payload);
  } catch {
    throw new Error("Plugin execution request cannot be serialized.");
  }

  if (serialized.length > PLUGIN_EXECUTION_LIMITS.maxRequestBodyChars) {
    throw new Error("Plugin execution request is too large to send safely.");
  }

  return serialized;
}
