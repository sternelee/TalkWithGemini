import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { PluginInstallSchema } from "@/lib/api/schemas";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { listMcpTools } from "@/lib/mcp/client";
import { convertOpenApiSpecToPlugin } from "@/lib/plugin/openapi";
import { registerServerPlugin } from "@/lib/plugin/serverRegistry";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import type { Plugin } from "@/types";
import { decryptOptionalSecret } from "../../../../lib/byok/server";
import { BYOK_CONTEXTS } from "../../../../lib/byok/shared";
import { normalizeMcpToolFunctions } from "../../../../lib/mcp/registry";
import { isPluginAuthRequired } from "../../../../lib/plugin/config";

export async function POST(request: NextRequest) {
  try {
    const body = PluginInstallSchema.parse(await readJsonRequestBody(request));
    const { plugin, customInput, authConfig } = body;

    if (customInput) {
      // Install custom plugin
      let spec;
      let url = "";

      try {
        if (customInput.trim().startsWith("http")) {
          url = customInput.trim();
          const { response, data } = await safeFetchJson<any>(
            url,
            { method: "GET" },
            {
              policy: getSafeUrlPolicy("pluginManifest"),
              timeoutMs: 20_000,
              maxResponseBytes: 3 * 1024 * 1024,
            },
          );
          if (!response.ok) throw new Error("Failed to fetch from URL");
          spec = data;
        } else {
          spec = JSON.parse(customInput);
        }
      } catch {
        return NextResponse.json(
          {
            error: "Invalid OpenAPI spec or URL",
            code: "PLUGIN_MANIFEST_INVALID",
            statusCode: 400,
          },
          { status: 400 },
        );
      }

      const id = `custom-${Date.now()}`;
      const base = {
        id,
        title: spec.info?.title || "Custom Plugin",
        description: spec.info?.description || "User added plugin",
        manifestUrl: url,
        category: "Custom",
        added: new Date().toISOString(),
      };

      const installedPlugin = convertOpenApiSpecToPlugin(
        spec,
        base,
        url || undefined,
      );
      await registerServerPlugin(installedPlugin as Plugin);
      return NextResponse.json({ plugin: installedPlugin });
    } else if (plugin) {
      // Install from marketplace
      if (plugin.source === "mcp") {
        if (!plugin.id) {
          return NextResponse.json(
            {
              error: "Missing plugin id",
              code: "PLUGIN_ID_MISSING",
              statusCode: 400,
            },
            { status: 400 },
          );
        }

        if (!plugin.mcp?.serverUrl || !plugin.mcp.serverName) {
          return NextResponse.json(
            {
              error: "Missing MCP server metadata",
              code: "MCP_SERVER_METADATA_MISSING",
              statusCode: 400,
            },
            { status: 400 },
          );
        }

        const authValue = await decryptOptionalSecret(
          authConfig?.valueSecret,
          BYOK_CONTEXTS.pluginAuth(plugin.id),
        );
        if (isPluginAuthRequired(plugin as Plugin) && !authValue) {
          return NextResponse.json(
            {
              error:
                "MCP server requires authentication before tools can be listed",
              code: "MCP_AUTH_REQUIRED_FOR_INSTALL",
              statusCode: 400,
            },
            { status: 400 },
          );
        }

        const tools = await listMcpTools({
          serverUrl: plugin.mcp.serverUrl,
          staticHeaders: plugin.mcp.headers,
          ...(authValue
            ? {
                authConfig: {
                  type:
                    authConfig?.type ||
                    (plugin.auth?.type === "apiKey"
                      ? "apiKey"
                      : plugin.auth?.type === "oauth2"
                        ? "oauth2"
                        : "bearer"),
                  key:
                    authConfig?.key ||
                    plugin.auth?.name ||
                    (plugin.auth?.type === "apiKey"
                      ? "X-API-Key"
                      : "Authorization"),
                  addTo: authConfig?.addTo || plugin.auth?.in || "header",
                  value: authValue,
                },
              }
            : {}),
        });
        const functions = normalizeMcpToolFunctions(
          plugin.mcp.serverName,
          tools,
        );

        if (functions.length === 0) {
          return NextResponse.json(
            {
              error: "MCP server does not expose any supported tools",
              code: "MCP_TOOLS_EMPTY",
              statusCode: 400,
            },
            { status: 400 },
          );
        }

        const toolNameMap = Object.fromEntries(
          functions.map((functionDef) => [
            functionDef.name,
            functionDef.mcpToolName || functionDef.name,
          ]),
        );
        const installedPlugin: Plugin = {
          ...(plugin as Plugin),
          source: "mcp",
          category: plugin.category || "MCP",
          categories: plugin.categories?.length ? plugin.categories : ["MCP"],
          functions,
          mcp: {
            ...plugin.mcp,
            toolNameMap,
          },
        };

        await registerServerPlugin(installedPlugin);
        return NextResponse.json({ plugin: installedPlugin });
      }

      if (!plugin.manifestUrl) {
        return NextResponse.json(
          {
            error: "Missing plugin manifest URL",
            code: "PLUGIN_MANIFEST_URL_MISSING",
            statusCode: 400,
          },
          { status: 400 },
        );
      }
      const { response, data: spec } = await safeFetchJson<any>(
        plugin.manifestUrl,
        { method: "GET" },
        {
          policy: getSafeUrlPolicy("pluginManifest"),
          timeoutMs: 20_000,
          maxResponseBytes: 3 * 1024 * 1024,
        },
      );
      if (!response.ok) throw new Error("Failed to fetch OpenAPI spec");

      const installedPlugin = convertOpenApiSpecToPlugin(
        spec,
        plugin,
        plugin.manifestUrl,
      );
      await registerServerPlugin(installedPlugin as Plugin);

      return NextResponse.json({ plugin: installedPlugin });
    } else {
      return NextResponse.json(
        {
          error: "Missing plugin or customInput",
          code: "PLUGIN_INSTALL_INPUT_MISSING",
          statusCode: 400,
        },
        { status: 400 },
      );
    }
  } catch (error) {
    safeServerLogError("Error installing plugin:", error);
    return createApiErrorResponse(error, "Failed to install plugin");
  }
}
