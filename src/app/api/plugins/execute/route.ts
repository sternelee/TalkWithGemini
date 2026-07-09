import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import {
  PluginExecutionRequestSchema,
  ToolExecutionSchema,
} from "@/lib/api/schemas";
import { BYOK_CONTEXTS } from "../../../../lib/byok/shared";
import { executeMcpToolRequest } from "../../../../lib/mcp/executor";
import { isPluginAuthRequired } from "../../../../lib/plugin/config";
import { executePluginFunctionRequest } from "../../../../lib/plugin/pluginExecutionExecutor";
import {
  getServerPlugin,
  registerServerPlugin,
} from "../../../../lib/plugin/serverRegistry";
import { getDeploymentMode } from "../../../../lib/security/deployment";
import { decryptOptionalSecret } from "@/lib/byok/server";
import { safeFetchText } from "@/lib/security/safeFetch";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import type { Plugin, PluginFunction } from "@/types";

function getMcpAuthType(
  plugin: Plugin,
  authConfig: { type?: "bearer" | "apiKey" | "none" | "oauth2" } | undefined,
): "bearer" | "apiKey" | "none" | "oauth2" | undefined {
  if (authConfig?.type) return authConfig.type;
  if (
    plugin.auth?.type === "bearer" ||
    plugin.auth?.type === "apiKey" ||
    plugin.auth?.type === "oauth2" ||
    plugin.auth?.type === "none"
  ) {
    return plugin.auth.type;
  }
  return undefined;
}

/**
 * Plugin Function Execution API.
 * New requests resolve pluginId/functionName from the server registry; legacy
 * requests with full plugin/functionDef are kept for local-first compatibility.
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await readJsonRequestBody(request);
    const newBody = PluginExecutionRequestSchema.safeParse(rawBody);

    if (newBody.success) {
      const { pluginId, functionName, args, authConfig } = newBody.data;
      const registeredPlugin = await getServerPlugin(pluginId);
      if (!registeredPlugin) {
        return NextResponse.json(
          {
            error: "Plugin is not registered on the server",
            code: "PLUGIN_NOT_REGISTERED",
            statusCode: 404,
          },
          { status: 404 },
        );
      }

      const functionDef = registeredPlugin.functions?.find(
        (fn) => fn.name === functionName,
      );
      if (!functionDef) {
        return NextResponse.json(
          {
            error: "Plugin function is not declared by this plugin",
            code: "PLUGIN_FUNCTION_NOT_FOUND",
            statusCode: 400,
          },
          { status: 400 },
        );
      }

      const plugin =
        pluginId === "unsplash" && !authConfig?.valueSecret
          ? { ...registeredPlugin, baseUrl: "https://unsplash.com/napi" }
          : registeredPlugin;

      if (plugin.source === "mcp") {
        if (!plugin.mcp?.serverUrl) {
          return NextResponse.json(
            {
              error: "MCP server metadata is missing",
              code: "MCP_SERVER_METADATA_MISSING",
              statusCode: 400,
            },
            { status: 400 },
          );
        }

        const mcpToolName =
          plugin.mcp.toolNameMap?.[functionName] || functionDef.mcpToolName;
        if (!mcpToolName) {
          return NextResponse.json(
            {
              error: "MCP tool mapping is missing",
              code: "MCP_TOOL_MAPPING_MISSING",
              statusCode: 400,
            },
            { status: 400 },
          );
        }

        const authValue = await decryptOptionalSecret(
          authConfig?.valueSecret,
          BYOK_CONTEXTS.pluginAuth(plugin.id),
        );
        if (isPluginAuthRequired(plugin) && !authValue) {
          return NextResponse.json(
            {
              error: "Plugin authentication is required",
              code: "PLUGIN_AUTH_REQUIRED",
              statusCode: 400,
            },
            { status: 400 },
          );
        }

        const result = await executeMcpToolRequest({
          serverUrl: plugin.mcp.serverUrl,
          toolName: mcpToolName,
          args,
          staticHeaders: plugin.mcp.headers,
          authValue,
          authConfig: {
            type: getMcpAuthType(plugin, authConfig),
            key: authConfig?.key || plugin.auth?.name,
            addTo: authConfig?.addTo || plugin.auth?.in,
          },
        });

        return NextResponse.json({ result });
      }

      return executePluginFunctionRequest({
        plugin,
        functionDef,
        args,
        authConfig,
        decryptSecret: decryptOptionalSecret,
        fetchText: safeFetchText,
      });
    }

    if (
      getDeploymentMode() === "hosted" &&
      ToolExecutionSchema.safeParse(rawBody).success
    ) {
      return NextResponse.json(
        {
          error: "Legacy plugin execution payloads are disabled in hosted mode",
          code: "LEGACY_PLUGIN_PAYLOAD_DISABLED",
          statusCode: 403,
        },
        { status: 403 },
      );
    }

    const legacyBody = ToolExecutionSchema.parse(rawBody);
    const plugin = legacyBody.plugin as Plugin;
    try {
      await registerServerPlugin(plugin);
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/reserved built-in plugin id/i.test(error.message)
      ) {
        throw error;
      }
    }
    return executePluginFunctionRequest({
      plugin,
      functionDef: legacyBody.functionDef as PluginFunction,
      args: legacyBody.args,
      authConfig: legacyBody.authConfig,
      decryptSecret: decryptOptionalSecret,
      fetchText: safeFetchText,
    });
  } catch (error) {
    safeServerLogError("Error executing plugin function:", error);
    return createApiErrorResponse(error, "Plugin execution failed");
  }
}
