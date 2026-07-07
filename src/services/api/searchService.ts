import { Source, ImageSource } from "@/types";
import { useSettingsStore } from "@/store/core/settingsStore";
import { readJsonResponseOrThrow, signedApiFetch } from "../../lib/api/client";
import {
  normalizeImageSources,
  normalizeSearchSources,
} from "../../lib/search/results";
import {
  buildSearchRuntimeConfig,
  fetchWithByokRetry,
} from "../../lib/byok/client";
import { logDevError } from "../../lib/utils/devLogger";

export interface SearchOptions {
  query: string;
  scope?: string;
}

export async function createSearchProvider({ query, scope }: SearchOptions) {
  const { search } = useSettingsStore.getState();
  const provider = search.provider;
  if (provider === "google") {
    return { sources: [], images: [] };
  }

  const config = search.configs[provider] || {};
  const maxResult = search.resultsLimit || 5;

  try {
    const response = await fetchWithByokRetry(async () =>
      signedApiFetch("/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider,
          query,
          scope,
          config: await buildSearchRuntimeConfig(provider, config),
          maxResult,
        }),
      }),
    );

    if (!response.ok) {
      throw new Error("Search request failed");
    }

    const data = await readJsonResponseOrThrow<{
      sources?: Source[];
      images?: ImageSource[];
    }>(response, "Search request failed");
    return {
      sources: normalizeSearchSources(data.sources),
      images: normalizeImageSources(data.images),
    };
  } catch (error) {
    logDevError("Search error:", error);
    throw error;
  }
}
