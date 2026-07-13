import type { ImageSource, Message, Source } from "@/types";

export interface SearchDecision {
  shouldSearch: boolean;
  query: string;
}

function stripJsonCodeFence(value: string): string {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function parseSearchDecisionResult(
  raw: string,
  fallbackQuery: string,
): SearchDecision {
  try {
    const parsed = JSON.parse(stripJsonCodeFence(raw));
    const shouldSearch = parsed?.shouldSearch === true;
    const query =
      typeof parsed?.query === "string" && parsed.query.trim()
        ? parsed.query.trim()
        : fallbackQuery;

    return { shouldSearch, query };
  } catch {
    return { shouldSearch: false, query: fallbackQuery };
  }
}

export function createSearchDecisionPrompt({
  history,
  message,
}: {
  history: Message[];
  message: string;
}) {
  const recentHistory = history
    .slice(-6)
    .map((item) => `${item.role.toUpperCase()}: ${item.content}`)
    .join("\n\n");

  return `
Decide whether answering the user's latest message requires live web search.

Use search for: current or recent facts, prices, schedules, laws, releases, people/company roles, niche facts that may have changed, or requests that explicitly ask to search.
Do not use search for: writing, coding, translation, summarization, brainstorming, or stable general knowledge.

Conversation context:
${recentHistory || "(none)"}

Latest user message:
${message}

Return ONLY valid JSON with this shape:
{"shouldSearch": boolean, "query": "short search query"}
`;
}

export function buildSearchContextForPrompt(
  input: Source[] | { sources?: Source[]; images?: ImageSource[] },
): string {
  const sources = Array.isArray(input) ? input : input.sources || [];
  const images = Array.isArray(input) ? [] : input.images || [];
  if (sources.length === 0 && images.length === 0) return "";

  const sourceContext = sources
    .map(
      (source, index) =>
        `[${index + 1}]\nTitle: ${source.title}\nURL: ${source.url}\nContent:\n${source.content}`,
    )
    .join("\n\n");
  const imageContext = images
    .map((image, index) => {
      const description = image.description || `Search image ${index + 1}`;
      return `[image ${index + 1}]\nDescription: ${description}\nURL: ${image.url}\nMarkdown: ![${description}](${image.url})`;
    })
    .join("\n\n");

  return [
    "--- Web Search Context ---",
    "Use the following web search results as context. Use citations like [1] or [2] when you rely on a source.",
    "Use Markdown images when an image result is directly useful for the answer, using the provided image URL and description.",
    sourceContext,
    imageContext ? "--- Web Search Images ---" : "",
    imageContext,
    "--- End Web Search Context ---",
  ]
    .filter(Boolean)
    .join("\n");
}
