import { NextResponse } from "next/server";
import { BYOK_CONTEXTS, type EncryptedSecretEnvelope } from "../byok/shared";
import { decryptOptionalSecret } from "../byok/server";
import { isPluginAuthRequired } from "./config";
import {
  getPluginFunctionDefinitionError,
  getPluginFunctionPathError,
} from "./manifest";
import { safeFetchText } from "../security/safeFetch";
import { getSafeUrlPolicy, validateOutboundUrl } from "../security/urlPolicy";
import type { Plugin, PluginFunction } from "../../types";
import {
  AGNES_IMAGE_PLUGIN_ID,
  AGNES_VIDEO_PLUGIN_ID,
  normalizePluginResponse,
} from "./responseNormalizers";

export interface PluginAuthConfig {
  type?: "bearer" | "apiKey" | "none" | "oauth2";
  valueSecret?: EncryptedSecretEnvelope;
  key?: string;
  addTo?: "header" | "query";
}

type PluginAuthType = NonNullable<Plugin["auth"]>["type"];
type DecryptOptionalSecret = typeof decryptOptionalSecret;
type SafeFetchText = typeof safeFetchText;

const AGNES_IMAGE_MODEL = "agnes-image-2.1-flash";
const AGNES_VIDEO_MODEL = "agnes-video-v2.0";
const AGNES_VIDEO_RESULT_FUNCTION = "get_video_result";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getAuthType(
  plugin: Plugin,
  authConfig: PluginAuthConfig | undefined,
): PluginAuthConfig["type"] | PluginAuthType | undefined {
  if (plugin.auth?.type && plugin.auth.type !== "none") {
    return plugin.auth.type;
  }
  return authConfig?.type;
}

function prepareOutboundArgs(
  plugin: Plugin,
  functionDef: PluginFunction,
  args: Record<string, unknown>,
): Record<string, unknown> {
  if (plugin.id === AGNES_IMAGE_PLUGIN_ID) {
    const outbound = { ...args };
    outbound.model =
      typeof outbound.model === "string" && outbound.model.trim()
        ? outbound.model
        : AGNES_IMAGE_MODEL;

    const extraBody = isRecord(outbound.extra_body)
      ? { ...outbound.extra_body }
      : {};
    if (Array.isArray(outbound.image)) {
      extraBody.image = outbound.image;
      delete outbound.image;
    }
    if (typeof outbound.response_format === "string") {
      extraBody.response_format = outbound.response_format;
      delete outbound.response_format;
    }
    if (Object.keys(extraBody).length > 0) {
      outbound.extra_body = extraBody;
    }
    return outbound;
  }

  if (
    plugin.id === AGNES_VIDEO_PLUGIN_ID &&
    functionDef.name === "create_video"
  ) {
    return {
      ...args,
      model:
        typeof args.model === "string" && args.model.trim()
          ? args.model
          : AGNES_VIDEO_MODEL,
    };
  }

  return { ...args };
}

function getTrimmedStringArg(
  args: Record<string, unknown>,
  key: string,
): string | null {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function prepareAgnesVideoResultPath(
  outboundArgs: Record<string, unknown>,
  consumedArgs: Set<string>,
): string | null {
  const videoId = getTrimmedStringArg(outboundArgs, "video_id");
  const taskId = getTrimmedStringArg(outboundArgs, "task_id");

  if (videoId) {
    outboundArgs.video_id = videoId;
    delete outboundArgs.task_id;
    return "/agnesapi";
  }

  if (taskId) {
    outboundArgs.task_id = taskId;
    consumedArgs.add("task_id");
    return `/v1/videos/${encodeURIComponent(taskId)}`;
  }

  return null;
}

function getJinaReaderTargetError(
  args: Record<string, unknown>,
): string | null {
  const targetUrl = getTrimmedStringArg(args, "url");
  if (!targetUrl) return null;

  try {
    validateOutboundUrl(targetUrl, getSafeUrlPolicy("plugin"));
    return null;
  } catch {
    return "Jina reader URL is not allowed";
  }
}

export async function executePluginFunctionRequest({
  plugin,
  functionDef,
  args,
  authConfig,
  decryptSecret = decryptOptionalSecret,
  fetchText = safeFetchText,
}: {
  plugin: Plugin;
  functionDef: PluginFunction;
  args: Record<string, unknown>;
  authConfig?: PluginAuthConfig;
  decryptSecret?: DecryptOptionalSecret;
  fetchText?: SafeFetchText;
}) {
  if (!plugin.baseUrl) {
    return NextResponse.json(
      { error: "Plugin base URL is missing" },
      { status: 400 },
    );
  }

  const functionDefinitionError = getPluginFunctionDefinitionError(
    plugin,
    functionDef,
  );
  if (functionDefinitionError) {
    return NextResponse.json(
      { error: functionDefinitionError },
      { status: 400 },
    );
  }

  const functionPathError = getPluginFunctionPathError(functionDef);
  if (functionPathError) {
    return NextResponse.json({ error: functionPathError }, { status: 400 });
  }

  const method = functionDef.method.toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return NextResponse.json(
      { error: `Plugin method ${method} is not supported` },
      { status: 400 },
    );
  }

  const outboundArgs = prepareOutboundArgs(plugin, functionDef, args);
  if (plugin.id === "jina-web-reader") {
    const jinaTargetError = getJinaReaderTargetError(outboundArgs);
    if (jinaTargetError) {
      return NextResponse.json({ error: jinaTargetError }, { status: 400 });
    }
  }
  let path = functionDef.path.startsWith("/")
    ? functionDef.path
    : `/${functionDef.path}`;
  const consumedArgs = new Set<string>();

  if (
    plugin.id === AGNES_VIDEO_PLUGIN_ID &&
    functionDef.name === AGNES_VIDEO_RESULT_FUNCTION
  ) {
    const resultPath = prepareAgnesVideoResultPath(outboundArgs, consumedArgs);
    if (!resultPath) {
      return NextResponse.json(
        { error: "Agnes video result lookup requires video_id or task_id" },
        { status: 400 },
      );
    }
    path = resultPath;
  }

  for (const key in outboundArgs) {
    const val = outboundArgs[key];
    const nextPath = path.replace(`{${key}}`, encodeURIComponent(String(val)));
    if (nextPath !== path) consumedArgs.add(key);
    path = nextPath;
    const dashedPath = path.replace(
      `{${key.replace(/_/g, "-")}}`,
      encodeURIComponent(String(val)),
    );
    if (dashedPath !== path) consumedArgs.add(key);
    path = dashedPath;
  }

  if (/{[^}/]+}/.test(path)) {
    return NextResponse.json(
      { error: "Plugin path parameters are missing" },
      { status: 400 },
    );
  }

  const urlObj = new URL(path, `${plugin.baseUrl.replace(/\/+$/, "")}/`);
  if (method === "GET") {
    for (const key in outboundArgs) {
      if (!consumedArgs.has(key)) {
        urlObj.searchParams.append(key, String(outboundArgs[key]));
      }
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  const authValue = await decryptSecret(
    authConfig?.valueSecret,
    BYOK_CONTEXTS.pluginAuth(plugin.id),
  );
  if (isPluginAuthRequired(plugin) && plugin.id !== "unsplash" && !authValue) {
    return NextResponse.json(
      { error: "Plugin authentication is required" },
      { status: 400 },
    );
  }

  if (plugin.id === "jina-web-reader") {
    headers.Accept = "application/json";
  }

  if (authValue) {
    const authName =
      authConfig?.key ||
      plugin.auth?.name ||
      (plugin.auth?.type === "apiKey" ? "X-API-Key" : "Authorization");
    const authIn = authConfig?.addTo || plugin.auth?.in;
    const authType = getAuthType(plugin, authConfig);

    if (authType === "bearer" || authType === "oauth2") {
      headers.Authorization = `Bearer ${authValue}`;
    } else if (authType === "apiKey" || authConfig?.type === "apiKey") {
      if (authIn === "header") {
        headers[authName] = authValue;
      } else if (authIn === "query") {
        urlObj.searchParams.append(authName, authValue);
      } else if (["POST", "PUT", "PATCH"].includes(method)) {
        outboundArgs[authName] = authValue;
      } else {
        headers[authName] = authValue;
      }
    }
  }

  const { response: res, text } = await fetchText(
    urlObj.toString(),
    {
      method,
      headers,
      body: method !== "GET" ? JSON.stringify(outboundArgs) : undefined,
    },
    {
      policy: getSafeUrlPolicy("plugin"),
      timeoutMs: plugin.id === AGNES_IMAGE_PLUGIN_ID ? 120_000 : 30_000,
      maxResponseBytes:
        plugin.id === AGNES_IMAGE_PLUGIN_ID
          ? 16 * 1024 * 1024
          : 2 * 1024 * 1024,
    },
  );

  if (!res.ok) {
    return NextResponse.json(
      {
        error: `Plugin request failed with status ${res.status}`,
        status: res.status,
      },
      { status: 502 },
    );
  }

  let responseData;
  try {
    responseData = JSON.parse(text);
  } catch {
    responseData = text;
  }

  return NextResponse.json({
    result: normalizePluginResponse(plugin, responseData),
  });
}
