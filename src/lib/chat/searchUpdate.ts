import type { ImageSource, Message, Source } from "@/types";

export function mergeSources(
  existing: Source[] = [],
  incoming: Source[] = [],
): Source[] {
  const seen = new Set<string>();
  const merged: Source[] = [];

  for (const source of [...existing, ...incoming]) {
    const key = `${source.url}\n${source.title}\n${source.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(source);
  }

  return merged;
}

export function mergeImages(
  existing: ImageSource[] = [],
  incoming: ImageSource[] = [],
): ImageSource[] {
  const seen = new Set<string>();
  const merged: ImageSource[] = [];

  for (const image of [...existing, ...incoming]) {
    const key = `${image.url}\n${image.description || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(image);
  }

  return merged;
}

export function buildSearchUpdate(
  message: Message | undefined,
  isSearching: boolean,
  results?: { sources: Source[]; images: ImageSource[] },
): Partial<Message> {
  const updates: Partial<Message> = { isSearching };
  if (results) {
    updates.searchSources = mergeSources(
      message?.searchSources,
      results.sources,
    );
    updates.searchImages = mergeImages(message?.searchImages, results.images);
  }
  return updates;
}
