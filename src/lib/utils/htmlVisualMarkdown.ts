const MARKDOWN_LITERAL_FRAGMENT_RE =
  /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`)/g;
const HTML_TAG_RE = /<\/?[A-Za-z][^>\n]*>/g;
const HTML_VISUAL_MARKDOWN_FENCE_RE =
  /(^|\n)([ \t]{0,3})(```|~~~)[ \t]*(?:(?:markdown|md)\b[^\n]*)?\n([\s\S]*?)\n[ \t]*\3[ \t]*(?=\n|$)/gi;
const HTML_VISUAL_FRAGMENT_RE =
  /^\s*<(div|section|article|aside|main|details|table)\b[\s\S]*<\/\1>\s*$/i;
const HTML_VISUAL_STYLE_RE = /\sstyle\s*=\s*["'][^"']{8,}["']/i;
const UNSAFE_HTML_VISUAL_RE =
  /<\s*(?:script|style|iframe|object|embed|form|input|textarea)\b|\s(?:class|on[a-z]+)\s*=|javascript:|url\s*\(|@import|expression\s*\(/i;

function isMarkdownLiteralFragment(fragment: string): boolean {
  return (
    fragment.startsWith("```") ||
    fragment.startsWith("~~~") ||
    fragment.startsWith("`")
  );
}

function mapMarkdownTextFragments(
  source: string,
  transform: (fragment: string) => string,
): string {
  return source
    .split(MARKDOWN_LITERAL_FRAGMENT_RE)
    .map((fragment) => {
      if (!fragment || isMarkdownLiteralFragment(fragment)) {
        return fragment;
      }
      return transform(fragment);
    })
    .join("");
}

function normalizeEscapedHtmlAttributeQuotesInText(source: string): string {
  if (!source.includes('\\"') && !source.includes("\\'")) {
    return source;
  }

  return source.replace(HTML_TAG_RE, (tag) =>
    tag.replace(/\\"/g, '"').replace(/\\'/g, "'"),
  );
}

function isSafeHtmlVisualFragment(source: string): boolean {
  return (
    HTML_VISUAL_FRAGMENT_RE.test(source) &&
    HTML_VISUAL_STYLE_RE.test(source) &&
    !UNSAFE_HTML_VISUAL_RE.test(source)
  );
}

function normalizeHtmlVisualMarkdownFences(source: string): string {
  if (!source.includes("```") && !source.includes("~~~")) {
    return source;
  }

  return source.replace(
    HTML_VISUAL_MARKDOWN_FENCE_RE,
    (
      match: string,
      prefix: string,
      _indent: string,
      _fence: string,
      code: string,
    ) => {
      const normalizedCode = normalizeEscapedHtmlAttributeQuotesInText(
        code.trim(),
      );
      if (!isSafeHtmlVisualFragment(normalizedCode)) {
        return match;
      }
      return `${prefix}${normalizedCode}`;
    },
  );
}

export function normalizeHtmlVisualMarkdown(source: string): string {
  const withVisualFences = normalizeHtmlVisualMarkdownFences(source);
  return mapMarkdownTextFragments(
    withVisualFences,
    normalizeEscapedHtmlAttributeQuotesInText,
  );
}
