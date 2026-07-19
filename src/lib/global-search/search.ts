import { GLOBAL_SEARCH_LIMITS } from "@/config/limits";
import type {
  GlobalSearchDocument,
  GlobalSearchFilters,
  GlobalSearchIndex,
  GlobalSearchQueryOptions,
  GlobalSearchResult,
} from "./types";

const DEFAULT_RESULT_LIMIT = GLOBAL_SEARCH_LIMITS.maxResults;
const MAX_RESULT_LIMIT = GLOBAL_SEARCH_LIMITS.maxResults;
const SNIPPET_CONTEXT_CHARS = 110;

export function normalizeGlobalSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function queryTokens(query: string): string[] {
  const normalized = normalizeGlobalSearchText(query);
  if (!normalized) return [];
  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.length > 1 ? [normalized, ...tokens] : tokens;
}

function matchesFilters(
  document: GlobalSearchDocument,
  filters: GlobalSearchFilters | undefined,
): boolean {
  if (!filters) return true;
  if (filters.sources?.length && !filters.sources.includes(document.source)) {
    return false;
  }
  if (filters.workspaceId) {
    const belongsToWorkspace =
      document.workspaceId === filters.workspaceId ||
      document.workspaceIds?.includes(filters.workspaceId);
    if (!belongsToWorkspace) return false;
  }
  if (filters.roles?.length) {
    if (!document.role || !filters.roles.includes(document.role)) return false;
  }
  if (filters.dateFrom !== undefined && document.updatedAt < filters.dateFrom) {
    return false;
  }
  if (filters.dateTo !== undefined && document.updatedAt > filters.dateTo) {
    return false;
  }
  return true;
}

function scoreDocument(
  document: GlobalSearchDocument,
  query: string,
  tokens: string[],
): { score: number; matchedIn: GlobalSearchResult["matchedIn"] } | null {
  const title = normalizeGlobalSearchText(document.title);
  const keywords = normalizeGlobalSearchText(document.keywords.join(" "));
  const content = normalizeGlobalSearchText(document.content);
  const searchable = `${title} ${keywords} ${content}`;
  const individualTokens = tokens.length > 1 ? tokens.slice(1) : tokens;

  if (!individualTokens.every((token) => searchable.includes(token)))
    return null;

  let score = 0;
  let matchedIn: GlobalSearchResult["matchedIn"] = "content";
  if (title === query) score += 180;
  if (title.includes(query)) {
    score += 100;
    matchedIn = "title";
  }
  if (keywords.includes(query)) {
    score += 70;
    if (matchedIn === "content") matchedIn = "keywords";
  }
  if (content.includes(query)) score += 45;

  for (const token of individualTokens) {
    if (title.includes(token)) {
      score += 35;
      matchedIn = "title";
    }
    if (keywords.includes(token)) {
      score += 20;
      if (matchedIn === "content") matchedIn = "keywords";
    }
    if (content.includes(token)) score += 8;
  }

  return { score, matchedIn };
}

function findRawMatch(content: string, normalizedQuery: string): number {
  const raw = content.toLocaleLowerCase();
  const exactIndex = raw.indexOf(normalizedQuery);
  if (exactIndex >= 0) return exactIndex;
  const firstToken = normalizedQuery.split(" ").find(Boolean);
  return firstToken ? raw.indexOf(firstToken) : -1;
}

export function createGlobalSearchSnippet(
  document: GlobalSearchDocument,
  query: string,
  matchedIn: GlobalSearchResult["matchedIn"],
): string {
  const source =
    matchedIn === "title"
      ? document.title
      : matchedIn === "keywords"
        ? document.keywords.join(" · ")
        : document.content || document.title;
  const normalizedQuery = normalizeGlobalSearchText(query);
  const matchIndex = findRawMatch(source, normalizedQuery);
  if (source.length <= SNIPPET_CONTEXT_CHARS * 2) return source;
  if (matchIndex < 0) return `${source.slice(0, SNIPPET_CONTEXT_CHARS * 2)}…`;

  const start = Math.max(0, matchIndex - SNIPPET_CONTEXT_CHARS);
  const end = Math.min(
    source.length,
    matchIndex + normalizedQuery.length + SNIPPET_CONTEXT_CHARS,
  );
  return `${start > 0 ? "…" : ""}${source.slice(start, end)}${
    end < source.length ? "…" : ""
  }`;
}

export function searchGlobalIndex(
  index: GlobalSearchIndex,
  query: string,
  options: GlobalSearchQueryOptions = {},
): GlobalSearchResult[] {
  const normalizedQuery = normalizeGlobalSearchText(query);
  const tokens = queryTokens(query);
  if (!normalizedQuery || tokens.length === 0) return [];

  const results: GlobalSearchResult[] = [];
  for (const document of index.documents) {
    if (!matchesFilters(document, options.filters)) continue;
    const match = scoreDocument(document, normalizedQuery, tokens);
    if (!match) continue;
    results.push({
      document,
      score: match.score,
      matchedIn: match.matchedIn,
      snippet: createGlobalSearchSnippet(document, query, match.matchedIn),
    });
  }

  const sort = options.sort || "relevance";
  results.sort((a, b) => {
    if (sort === "newest") return b.document.updatedAt - a.document.updatedAt;
    if (sort === "oldest") return a.document.updatedAt - b.document.updatedAt;
    return b.score - a.score || b.document.updatedAt - a.document.updatedAt;
  });

  const limit = Math.min(
    MAX_RESULT_LIMIT,
    Math.max(1, Math.floor(options.limit || DEFAULT_RESULT_LIMIT)),
  );
  return results.slice(0, limit);
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

export function getGlobalSearchHighlightSegments(
  value: string,
  query: string,
): HighlightSegment[] {
  const normalizedQuery = normalizeGlobalSearchText(query);
  if (!value || !normalizedQuery) return [{ text: value, highlighted: false }];

  const raw = value.toLocaleLowerCase();
  const terms = Array.from(
    new Set([normalizedQuery, ...normalizedQuery.split(" ")].filter(Boolean)),
  ).sort((a, b) => b.length - a.length);
  const matches: Array<{ start: number; end: number }> = [];

  for (const term of terms) {
    let index = raw.indexOf(term);
    while (index >= 0) {
      const end = index + term.length;
      if (!matches.some((match) => index < match.end && end > match.start)) {
        matches.push({ start: index, end });
      }
      index = raw.indexOf(term, end);
    }
  }

  if (matches.length === 0) return [{ text: value, highlighted: false }];
  matches.sort((a, b) => a.start - b.start);

  const segments: HighlightSegment[] = [];
  let cursor = 0;
  for (const match of matches) {
    if (match.start > cursor) {
      segments.push({
        text: value.slice(cursor, match.start),
        highlighted: false,
      });
    }
    segments.push({
      text: value.slice(match.start, match.end),
      highlighted: true,
    });
    cursor = match.end;
  }
  if (cursor < value.length) {
    segments.push({ text: value.slice(cursor), highlighted: false });
  }
  return segments;
}
