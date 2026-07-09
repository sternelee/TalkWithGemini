import { NextResponse } from "next/server";
import { createApiErrorResponse } from "@/lib/api/middleware";
import { MARKET_LIMITS } from "../../../../config/limits";
import {
  MCP_REGISTRY_BASE_URL,
  normalizeMcpRegistryServers,
} from "../../../../lib/mcp/registry";
import { safeFetchJson } from "../../../../lib/security/safeFetch";
import { getSafeUrlPolicy } from "../../../../lib/security/urlPolicy";
import { safeServerLogError } from "../../../../lib/utils/safeServerLog";

const MCP_REGISTRY_UPSTREAM_LIMIT = 100;
const MCP_REGISTRY_MAX_UPSTREAM_PAGES_PER_REQUEST = 10;

function getNextCursor(value: unknown): string {
  if (!value || typeof value !== "object") return "";

  const raw = value as Record<string, unknown>;
  const metadata =
    raw.metadata && typeof raw.metadata === "object"
      ? (raw.metadata as Record<string, unknown>)
      : {};
  const pagination =
    raw.pagination && typeof raw.pagination === "object"
      ? (raw.pagination as Record<string, unknown>)
      : {};

  const cursor =
    raw.nextCursor || metadata.nextCursor || pagination.nextCursor || "";
  return typeof cursor === "string" ? cursor : "";
}

function getPageLimit(requestUrl: URL): number {
  const parsed = Number(requestUrl.searchParams.get("limit"));
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(Math.floor(parsed), MARKET_LIMITS.maxPlugins));
}

function getSearchParam(requestUrl: URL): string {
  return (requestUrl.searchParams.get("search") || "").trim().slice(0, 120);
}

function getCursorParam(requestUrl: URL): string {
  return (requestUrl.searchParams.get("cursor") || "").trim().slice(0, 512);
}

export async function GET(request: Request) {
  try {
    const requestUrl = new URL(request.url);
    const pageLimit = getPageLimit(requestUrl);
    const search = getSearchParam(requestUrl);
    const plugins = [];
    let cursor = getCursorParam(requestUrl);
    let nextCursor = "";

    for (
      let page = 0;
      page < MCP_REGISTRY_MAX_UPSTREAM_PAGES_PER_REQUEST &&
      plugins.length < pageLimit;
      page += 1
    ) {
      const url = new URL(`${MCP_REGISTRY_BASE_URL}/servers`);
      url.searchParams.set("limit", String(MCP_REGISTRY_UPSTREAM_LIMIT));
      url.searchParams.set("version", "latest");
      if (cursor) url.searchParams.set("cursor", cursor);
      if (search) url.searchParams.set("search", search);

      const { response, data } = await safeFetchJson<unknown>(
        url.toString(),
        { method: "GET" },
        {
          policy: {
            ...getSafeUrlPolicy("pluginManifest"),
            allowedHosts: ["registry.modelcontextprotocol.io"],
          },
          timeoutMs: 20_000,
          maxResponseBytes: MARKET_LIMITS.maxPluginListResponseBytes,
        },
      );

      if (!response.ok) {
        throw new Error("Failed to fetch MCP registry");
      }

      plugins.push(
        ...normalizeMcpRegistryServers(data, {
          maxServers: pageLimit - plugins.length,
        }),
      );

      nextCursor = getNextCursor(data);
      if (!nextCursor) break;
      cursor = nextCursor;
    }

    return NextResponse.json({
      plugins,
      nextCursor: nextCursor || undefined,
    });
  } catch (error) {
    safeServerLogError("Error fetching MCP servers:", error);
    return createApiErrorResponse(error, "Failed to fetch MCP servers");
  }
}
