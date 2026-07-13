import { NextRequest, NextResponse } from "next/server";
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";
import { SearchRequestSchema } from "@/lib/api/schemas";
import type { SearchProvider } from "@/lib/security/searchPolicy";
import {
  normalizeImageSources,
  normalizeSearchSources,
} from "@/lib/search/results";
import { safeFetchJson } from "@/lib/security/safeFetch";
import {
  runSearchProvider,
  SearchProviderError,
} from "@/lib/search/providerAdapters";
import { BYOK_CONTEXTS } from "@/lib/byok/shared";
import { decryptOptionalSecret } from "@/lib/byok/server";
import { getDefaultSearchRuntimeConfig } from "@/lib/defaultConfig/server";
import { safeServerLogError } from "@/lib/utils/safeServerLog";

export async function POST(request: NextRequest) {
  try {
    const body = SearchRequestSchema.parse(await readJsonRequestBody(request));
    const { provider, query, scope, config, maxResult } = body;
    const defaultSearch =
      provider === "default" ? getDefaultSearchRuntimeConfig() : null;
    const effectiveProvider = (defaultSearch?.provider ||
      provider) as SearchProvider;
    const maxResultNumber = maxResult || 5;
    const apiKey =
      defaultSearch?.apiKey ||
      (await decryptOptionalSecret(
        config?.apiKeySecret,
        BYOK_CONTEXTS.search(provider),
      ));
    const baseUrl = defaultSearch?.baseUrl || config?.baseUrl;

    if (provider === "default" && !defaultSearch) {
      return NextResponse.json(
        { error: "Default search provider is not configured" },
        { status: 400 },
      );
    }

    let searchResults;
    try {
      searchResults = await runSearchProvider({
        provider: effectiveProvider,
        query,
        scope,
        apiKey,
        baseUrl,
        maxResultNumber,
        fetchJson: safeFetchJson,
        signal: request.signal,
      });
    } catch (error) {
      if (error instanceof SearchProviderError) {
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      }
      throw error;
    }

    return NextResponse.json({
      sources: normalizeSearchSources(searchResults.sources),
      images: normalizeImageSources(searchResults.images),
    });
  } catch (error) {
    if (
      request.signal.aborted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      return new Response(null, { status: 499 });
    }
    safeServerLogError("Search error:", error);
    return createApiErrorResponse(error, "Search failed");
  }
}
