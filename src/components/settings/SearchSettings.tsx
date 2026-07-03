import React from "react";
import { Globe, Server, Zap } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSettingsStore } from "@/store/core/settingsStore";
import { SearchProviderItem } from "./SettingsUI";
import { SEARCH_CONFIG_LIMITS } from "@/config/limits";
// Base URLs moved to API routes
const TAVILY_BASE_URL = "https://api.tavily.com";
const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev";
const EXA_BASE_URL = "https://api.exa.ai";
const BOCHA_BASE_URL = "https://api.bochaai.com";
const SEARXNG_BASE_URL = "http://localhost:8080";
const TAVILY_KEY_URL = "https://app.tavily.com/";
const EXA_KEY_URL = "https://dashboard.exa.ai/api-keys";
const FIRECRAWL_KEY_URL = "https://www.firecrawl.dev/app";
const BOCHA_KEY_URL = "https://open.bochaai.com/";

const SearchSettings = () => {
  const t = useTranslations("Search");
  const {
    search,
    serverConfig,
    setSearchProvider,
    updateSearchConfig,
    setSearchResultsLimit,
  } = useSettingsStore();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground">
            {t("title")}
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {serverConfig?.search.available && (
            <SearchProviderItem
              id="default"
              name={t("defaultService")}
              description={t("defaultServiceDesc")}
              icon={<Server size={18} />}
              isActive={search.provider === "default"}
              onActivate={() => setSearchProvider("default")}
              hasApiKey={false}
              hasBaseUrl={false}
            />
          )}
          <SearchProviderItem
            id="google"
            name={t("modelBuiltIn")}
            description={t("modelBuiltInDesc")}
            icon={<Zap size={18} />}
            isActive={search.provider === "google"}
            onActivate={() => setSearchProvider("google")}
            hasApiKey={false}
            hasBaseUrl={false}
          />
          <SearchProviderItem
            id="tavily"
            name="Tavily"
            icon={<Globe size={18} />}
            isActive={search.provider === "tavily"}
            onActivate={() => setSearchProvider("tavily")}
            defaultBaseUrl={TAVILY_BASE_URL}
            config={search.configs["tavily"]}
            onUpdateConfig={(c) => updateSearchConfig("tavily", c)}
            apiKeyMaxLength={SEARCH_CONFIG_LIMITS.maxApiKeyChars}
            baseUrlMaxLength={SEARCH_CONFIG_LIMITS.maxBaseUrlChars}
            apiKeyHelpUrl={TAVILY_KEY_URL}
          />
          <SearchProviderItem
            id="exa"
            name="Exa"
            icon={<Globe size={18} />}
            isActive={search.provider === "exa"}
            onActivate={() => setSearchProvider("exa")}
            defaultBaseUrl={EXA_BASE_URL}
            config={search.configs["exa"]}
            onUpdateConfig={(c) => updateSearchConfig("exa", c)}
            apiKeyMaxLength={SEARCH_CONFIG_LIMITS.maxApiKeyChars}
            baseUrlMaxLength={SEARCH_CONFIG_LIMITS.maxBaseUrlChars}
            apiKeyHelpUrl={EXA_KEY_URL}
          />
          <SearchProviderItem
            id="firecrawl"
            name="Firecrawl"
            icon={<Globe size={18} />}
            isActive={search.provider === "firecrawl"}
            onActivate={() => setSearchProvider("firecrawl")}
            defaultBaseUrl={FIRECRAWL_BASE_URL}
            config={search.configs["firecrawl"]}
            onUpdateConfig={(c) => updateSearchConfig("firecrawl", c)}
            apiKeyMaxLength={SEARCH_CONFIG_LIMITS.maxApiKeyChars}
            baseUrlMaxLength={SEARCH_CONFIG_LIMITS.maxBaseUrlChars}
            apiKeyHelpUrl={FIRECRAWL_KEY_URL}
          />
          <SearchProviderItem
            id="bocha"
            name="Bocha"
            icon={<Globe size={18} />}
            isActive={search.provider === "bocha"}
            onActivate={() => setSearchProvider("bocha")}
            defaultBaseUrl={BOCHA_BASE_URL}
            config={search.configs["bocha"]}
            onUpdateConfig={(c) => updateSearchConfig("bocha", c)}
            apiKeyMaxLength={SEARCH_CONFIG_LIMITS.maxApiKeyChars}
            baseUrlMaxLength={SEARCH_CONFIG_LIMITS.maxBaseUrlChars}
            apiKeyHelpUrl={BOCHA_KEY_URL}
          />
          <SearchProviderItem
            id="searxng"
            name="SearXNG"
            icon={<Server size={18} />}
            description={t("searxngDesc")}
            isActive={search.provider === "searxng"}
            onActivate={() => setSearchProvider("searxng")}
            defaultBaseUrl={SEARXNG_BASE_URL}
            hasApiKey={false}
            config={search.configs["searxng"]}
            onUpdateConfig={(c) => updateSearchConfig("searxng", c)}
            baseUrlMaxLength={SEARCH_CONFIG_LIMITS.maxBaseUrlChars}
          />
        </div>
      </div>

      <div className="space-y-2 pt-4 border-t border-gray-100 dark:border-border">
        <div className="flex justify-between text-sm text-gray-700 dark:text-foreground/85">
          <label htmlFor="search-results-limit" className="font-medium">
            {t("resultLimit")}
          </label>
          <span className="font-mono bg-gray-100 dark:bg-muted px-2 py-0.5 rounded text-xs">
            {search.resultsLimit}
          </span>
        </div>
        <input
          id="search-results-limit"
          name="searchResultsLimit"
          type="range"
          min="1"
          max="10"
          step="1"
          value={search.resultsLimit}
          onChange={(e) => setSearchResultsLimit(parseInt(e.target.value, 10))}
          aria-describedby="search-results-limit-bounds"
          className="w-full h-2 bg-gray-200 dark:bg-accent rounded-lg appearance-none cursor-pointer accent-blue-500"
        />
        <div
          id="search-results-limit-bounds"
          className="flex justify-between text-[10px] text-gray-400"
        >
          <span>1</span>
          <span>10</span>
        </div>
      </div>
    </div>
  );
};

export default SearchSettings;
