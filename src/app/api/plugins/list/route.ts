import { NextResponse } from "next/server";
import { safeFetchJson } from "@/lib/security/safeFetch";
import { getSafeUrlPolicy } from "@/lib/security/urlPolicy";
import { normalizeApiGuruPlugins } from "@/lib/market/plugins";
import { MARKET_LIMITS } from "@/config/limits";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

const APIS_GURU_LIST_URL = "https://api.apis.guru/v2/list.json";

export async function GET() {
  try {
    const { response, data } = await safeFetchJson(
      APIS_GURU_LIST_URL,
      { method: "GET" },
      {
        policy: {
          ...getSafeUrlPolicy("pluginManifest"),
          allowedProtocols: ["https:"],
          allowedHosts: ["api.apis.guru"],
        },
        timeoutMs: 20_000,
        maxResponseBytes: MARKET_LIMITS.maxPluginListResponseBytes,
      },
    );
    if (!response.ok) throw new Error("Failed to fetch APIs.guru list");

    const plugins = normalizeApiGuruPlugins(data);

    return NextResponse.json({ plugins });
  } catch (error) {
    safeServerLogError("Error fetching plugin list:", error);
    return NextResponse.json(
      { error: "Failed to fetch plugins" },
      { status: 500 },
    );
  }
}
