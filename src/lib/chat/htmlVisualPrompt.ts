import { API_INPUT_LIMITS } from "../../config/limits";
import { clampChatInputText } from "../utils/chatInput";

export const HTML_VISUAL_PROMPT_MARKER = "<html-visual>";

const HTML_VISUAL_PROMPT_INSTRUCTION = `<format scope="request">
<html-visual>
When the answer contains complex structure, workflows, comparisons, dense facts, timelines, trees, or compact summaries, actively use safe inline HTML as a core presentation tool instead of falling back to plain vertical Markdown.
Follow the user's language. Keep the response compact and information dense.
Use raw HTML fragments directly inside the Markdown body. Suitable fragments include callouts, comparison grids, badges, timelines, cards, and small visual summaries.
Do not wrap HTML visual fragments in code fences, including html, markdown, md, or unlabeled code fences.
Allowed elements include div, section, article, aside, main, span, p, details, summary, table, thead, tbody, tr, th, td, ul, ol, li, a, and img.
Use only inline style attributes for layout, spacing, borders, color, and typography.
Prefer the app's semantic neon diagram palette: cyan for UI and links, mint for agent logic and success, violet for context or code, amber for tool or warning states, and rose for policy or danger states. Use semantic variables such as var(--html-visual-surface), var(--html-visual-foreground), var(--html-visual-subtle-border), var(--html-visual-info-surface), var(--html-visual-knowledge-surface), var(--html-visual-success-surface), var(--html-visual-warning-surface), var(--html-visual-danger-surface), var(--diagram-line), and var(--markdown-soft-surface) so visual blocks remain readable in light and dark themes.
You may use the same cyan, mint, violet, amber, and rose hue families for badges, borders, and soft callouts, but prefer the semantic variables over raw hex values and keep strong foreground/background contrast.
Prefer pale surfaces in light mode, near-navy translucent surfaces in dark mode, transparent or very subtle borders, soft separation, and subtle neon accents only where they clarify hierarchy.
Do not use pale, low-contrast, or translucent text on light, pale, transparent, or unset backgrounds. Prefer semantic foreground variables such as var(--html-visual-foreground), var(--markdown-foreground), and the tone-specific foreground variables for body text, labels, and table cells.
Pair every hard-coded foreground color with an intentional background; if a background is transparent or inherited, use a high-contrast semantic foreground instead of white, off-white, light gray, or pastel text.
When presenting a table, output the table directly or place it only inside a transparent overflow wrapper. Do not wrap tables in styled cards, panels, or section backgrounds.
Avoid dark, heavy, high-saturation, or strongly framed blocks unless the user explicitly asks for that visual direction.
When hard-coded colors are necessary, keep strong foreground/background contrast and avoid hard-coding white-on-white, black-on-black, very pale text on pale cards, or very dark text on dark cards.
Do not use class attributes, style tags, script tags, iframes, forms, inputs, event handlers, external CSS, url(...) styles, JavaScript URLs, or full HTML documents.
Do not output full HTML documents, html/head/body tags, or page-level wrappers.
If the user explicitly asks for plain text, pure Markdown, or an HTML code example, obey that explicit request instead.
</html-visual>
</format>`;

const HTML_VISUAL_REQUEST_INSTRUCTIONS = `<format_instructions data-html-visual="true">
For this request, apply the html-visual rules from the system instructions when structure is complex.
Use safe raw HTML fragments directly in the Markdown body for visual layout when helpful.
Prefer the app's semantic neon palette variables and other semantic variables, pale light surfaces, near-navy dark surfaces, very subtle borders, soft separation, and strong foreground/background contrast so the fragment works in light and dark themes.
Do not use pale text on light, pale, transparent, or unset backgrounds. Prefer semantic foreground variables for body text, labels, and table cells, and only hard-code text colors when the paired background is explicit and high-contrast.
Use cyan, mint, violet, amber, and rose accents restrainedly instead of large saturated fills.
For tables, use the table directly or a transparent overflow wrapper; avoid styled table container cards.
Never place HTML visual fragments inside code fences. Do not use class attributes, style tags, scripts, iframes, event handlers, url(...) styles, JavaScript URLs, or full HTML documents.
</format_instructions>`;

export function buildHtmlVisualPromptInstruction(): string {
  return HTML_VISUAL_PROMPT_INSTRUCTION;
}

export function isHtmlVisualPromptInstructionEnabled(
  systemInstruction?: string,
): boolean {
  return Boolean(systemInstruction?.includes(HTML_VISUAL_PROMPT_MARKER));
}

export function appendHtmlVisualRequestInstructions(
  message: string,
  systemInstruction?: string,
  maxChars: number = API_INPUT_LIMITS.maxChatTextChars,
): string {
  if (!isHtmlVisualPromptInstructionEnabled(systemInstruction)) {
    return message;
  }
  if (message.includes('data-html-visual="true"')) {
    return message;
  }

  const separator = "\n\n";
  const maxMessageChars = Math.max(
    0,
    maxChars - separator.length - HTML_VISUAL_REQUEST_INSTRUCTIONS.length,
  );
  const boundedMessage = clampChatInputText(message, maxMessageChars);
  return `${boundedMessage}${separator}${HTML_VISUAL_REQUEST_INSTRUCTIONS}`;
}
