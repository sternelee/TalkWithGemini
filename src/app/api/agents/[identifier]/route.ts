import { NextRequest, NextResponse } from "next/server";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { normalizeAgentDetail } from "@/lib/market/agents";
import { normalizeAgentMarketLocale } from "@/lib/market/agentLocale";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const API_URL =
  "https://registry.npmmirror.com/@lobehub/agents-index/v1/files/public";
const DETAIL_FILE_SUFFIXES = {
  en: "",
  zh: ".zh-CN",
  ja: ".ja-JP",
} as const;

function getAgentDetailLocale(request: NextRequest | Request) {
  const url = "nextUrl" in request ? request.nextUrl : new URL(request.url);
  return normalizeAgentMarketLocale(url.searchParams.get("locale"));
}

export async function GET(
  request: NextRequest | Request,
  { params }: { params: Promise<{ identifier: string }> },
) {
  try {
    const { identifier } = await params;
    if (!/^[A-Za-z0-9._-]+$/.test(identifier)) {
      return NextResponse.json(
        { error: "Invalid agent identifier" },
        { status: 400 },
      );
    }

    const locale = getAgentDetailLocale(request);
    const detailFile = `${identifier}${DETAIL_FILE_SUFFIXES[locale]}.json`;
    const { response, data } = await safeFetchJson<any>(
      `${API_URL}/${encodeURIComponent(detailFile)}`,
      { method: "GET" },
      {
        policy: {
          ...getSafeUrlPolicy("agent"),
          allowedProtocols: ["https:"],
          allowedHosts: ["registry.npmmirror.com"],
        },
        timeoutMs: 20_000,
        maxResponseBytes: 2 * 1024 * 1024,
      },
    );

    if (!response.ok) throw new Error("Failed to fetch agent details");

    const agent = normalizeAgentDetail(data, identifier);
    if (!agent) {
      return NextResponse.json(
        { error: "Invalid agent detail response" },
        { status: 502 },
      );
    }

    return NextResponse.json(agent);
  } catch (error) {
    safeServerLogError("Error fetching agent detail:", error);
    return NextResponse.json(
      { error: "Failed to fetch agent details" },
      { status: 500 },
    );
  }
}
