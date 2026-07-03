import type { Source } from "../../types";

export function createCitationHref(index: number): string {
  return `#citation-${index}`;
}

export function linkifyCitationReferences(
  content: string,
  sources: Source[] | undefined,
): string {
  if (!sources?.length) return content;

  const segments = content.split(/(`+[^`]+`+)/g);
  return segments
    .map((segment, segmentIndex) => {
      if (segmentIndex % 2 === 1) return segment;

      return segment.replace(/\[(\d+)\]/g, (match, value) => {
        const sourceIndex = Number.parseInt(value, 10) - 1;
        return sources[sourceIndex]
          ? `[${value}](${createCitationHref(sourceIndex)})`
          : match;
      });
    })
    .join("");
}
