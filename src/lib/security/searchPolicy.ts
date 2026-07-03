import { getSafeUrlPolicy, SafeUrlPolicy } from "./urlPolicy";

export type SearchProvider =
  "tavily" | "firecrawl" | "exa" | "bocha" | "searxng";

const HOSTED_SEARCH_POLICY: SafeUrlPolicy = {
  context: "search",
  allowedProtocols: ["https:"],
  allowLocalhost: false,
  allowPrivateNetwork: false,
};

export function getSearchProviderPolicy(
  provider: SearchProvider,
): SafeUrlPolicy {
  if (provider === "searxng") {
    return getSafeUrlPolicy("search");
  }

  return HOSTED_SEARCH_POLICY;
}
