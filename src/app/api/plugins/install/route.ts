import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { PluginInstallSchema } from "@/lib/api/schemas";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { convertOpenApiSpecToPlugin } from "@/lib/plugin/openapi";
import { registerServerPlugin } from "@/lib/plugin/serverRegistry";
import { safeServerLogError } from "@/lib/utils/safeServerLog";
import type { Plugin } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body = PluginInstallSchema.parse(await readJsonRequestBody(request));
    const { plugin, customInput } = body;

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
