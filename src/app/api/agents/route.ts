import { NextRequest, NextResponse } from "next/server";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { normalizeMarketAgents } from "@/lib/market/agents";
import { normalizeAgentMarketLocale } from "@/lib/market/agentLocale";
import { safeServerLogWarn } from "@/lib/utils/safeServerLog";

const API_URL =
  "https://registry.npmmirror.com/@lobehub/agents-index/v1/files/public";

function getAgentListLocale(request?: NextRequest | Request) {
  if (!request) return "en";
  const url = "nextUrl" in request ? request.nextUrl : new URL(request.url);
  return normalizeAgentMarketLocale(url.searchParams.get("locale"));
}

export async function GET(request?: NextRequest | Request) {
  try {
    const locale = getAgentListLocale(request);
    const indexFile = locale === "zh" ? "index.zh-CN.json" : "index.json";
    const { response, data } = await safeFetchJson<any>(
      `${API_URL}/${indexFile}`,
      { method: "GET" },
      {
        policy: getSafeUrlPolicy("agent"),
        timeoutMs: 20_000,
        maxResponseBytes: 5 * 1024 * 1024,
      },
    );
    if (!response.ok) throw new Error("Failed to fetch agents");

    const agents = normalizeMarketAgents(data.agents);

    return NextResponse.json({ agents });
  } catch (error) {
    safeServerLogWarn("Agent registry unavailable:", error);
    return NextResponse.json({ agents: [], unavailable: true });
  }
}
