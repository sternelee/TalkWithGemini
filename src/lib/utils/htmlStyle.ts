import type { CSSProperties } from "react";

type SafeStyleOutput = Record<string, string | number>;

type ParsedColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const HTML_VISUAL_FOREGROUND = "var(--html-visual-foreground)";
const HTML_VISUAL_SURFACE = "var(--html-visual-surface)";
const HTML_VISUAL_ON_LIGHT = "var(--html-visual-on-light)";
const HTML_VISUAL_ON_DARK = "var(--html-visual-on-dark)";
const HTML_VISUAL_SUBTLE_BORDER = "var(--html-visual-subtle-border)";
const HTML_VISUAL_SHADOW = "var(--html-visual-shadow)";
const MIN_TEXT_CONTRAST_RATIO = 4.5;

const SAFE_STYLE_PROPERTIES = new Set([
  "alignContent",
  "alignItems",
  "alignSelf",
  "background",
  "backgroundColor",
  "border",
  "borderBlock",
  "borderBlockEnd",
  "borderBlockStart",
  "borderBottom",
  "borderColor",
  "borderInline",
  "borderInlineEnd",
  "borderInlineStart",
  "borderLeft",
  "borderRadius",
  "borderRight",
  "borderStyle",
  "borderTop",
  "borderWidth",
  "boxShadow",
  "boxSizing",
  "color",
  "columnGap",
  "display",
  "flex",
  "flexBasis",
  "flexDirection",
  "flexGrow",
  "flexShrink",
  "flexWrap",
  "fontSize",
  "fontStyle",
  "fontWeight",
  "gap",
  "gridAutoColumns",
  "gridAutoFlow",
  "gridAutoRows",
  "gridColumn",
  "gridColumnEnd",
  "gridColumnStart",
  "gridRow",
  "gridRowEnd",
  "gridRowStart",
  "gridTemplateColumns",
  "gridTemplateRows",
  "height",
  "justifyContent",
  "justifyItems",
  "justifySelf",
  "lineHeight",
  "margin",
  "marginBlock",
  "marginBlockEnd",
  "marginBlockStart",
  "marginBottom",
  "marginInline",
  "marginInlineEnd",
  "marginInlineStart",
  "marginLeft",
  "marginRight",
  "marginTop",
  "maxHeight",
  "maxWidth",
  "minHeight",
  "minWidth",
  "opacity",
  "order",
  "overflow",
  "overflowX",
  "overflowY",
  "padding",
  "paddingBlock",
  "paddingBlockEnd",
  "paddingBlockStart",
  "paddingBottom",
  "paddingInline",
  "paddingInlineEnd",
  "paddingInlineStart",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "placeContent",
  "placeItems",
  "placeSelf",
  "rowGap",
  "textAlign",
  "verticalAlign",
  "whiteSpace",
  "width",
]);

const UNSAFE_STYLE_VALUE_RE =
  /(?:url\s*\(|expression\s*\(|javascript:|@import|[<>{}])/i;
const COMPLEX_BACKGROUND_RE =
  /\b(?:repeating-)?(?:linear|radial|conic)-gradient\s*\(/i;
const HEX_COLOR_RE = /#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\b/gi;
const RGB_OR_HSL_COLOR_RE = /\b(?:rgba?|hsla?)\([^)]*\)/gi;
const NEUTRAL_KEYWORD_RE = /\b(?:black|white)\b/gi;
const CSS_VARIABLE_RE = /var\(--[a-z0-9-]+\)/gi;
const HTML_VISUAL_TONE_TOKEN_RE =
  /^var\(--html-visual-(info|knowledge|success|warning|danger)-(?:surface|foreground|border|accent)\)$/i;
const THEME_COLOR_TOKENS = new Map<string, string>([
  ["#ecfeff", "var(--html-visual-info-surface)"],
  ["#cffafe", "var(--html-visual-info-surface)"],
  ["#eff6ff", "var(--html-visual-info-surface)"],
  ["#dbeafe", "var(--html-visual-info-surface)"],
  ["#a5f3fc", "var(--html-visual-info-border)"],
  ["#67e8f9", "var(--html-visual-info-border)"],
  ["#bfdbfe", "var(--html-visual-info-border)"],
  ["#93c5fd", "var(--html-visual-info-border)"],
  ["#22d3ee", "var(--html-visual-info-accent)"],
  ["#06b6d4", "var(--html-visual-info-accent)"],
  ["#0891b2", "var(--html-visual-info-accent)"],
  ["#60a5fa", "var(--html-visual-info-accent)"],
  ["#3b82f6", "var(--html-visual-info-accent)"],
  ["#2563eb", "var(--html-visual-info-accent)"],
  ["#155e75", "var(--html-visual-info-foreground)"],
  ["#0e7490", "var(--html-visual-info-foreground)"],
  ["#1d4ed8", "var(--html-visual-info-foreground)"],
  ["#f5f3ff", "var(--html-visual-knowledge-surface)"],
  ["#ede9fe", "var(--html-visual-knowledge-surface)"],
  ["#faf5ff", "var(--html-visual-knowledge-surface)"],
  ["#f3e8ff", "var(--html-visual-knowledge-surface)"],
  ["#ddd6fe", "var(--html-visual-knowledge-border)"],
  ["#c4b5fd", "var(--html-visual-knowledge-border)"],
  ["#e9d5ff", "var(--html-visual-knowledge-border)"],
  ["#d8b4fe", "var(--html-visual-knowledge-border)"],
  ["#a78bfa", "var(--html-visual-knowledge-accent)"],
  ["#8b5cf6", "var(--html-visual-knowledge-accent)"],
  ["#7c3aed", "var(--html-visual-knowledge-accent)"],
  ["#c084fc", "var(--html-visual-knowledge-accent)"],
  ["#a855f7", "var(--html-visual-knowledge-accent)"],
  ["#9333ea", "var(--html-visual-knowledge-accent)"],
  ["#6d28d9", "var(--html-visual-knowledge-foreground)"],
  ["#7e22ce", "var(--html-visual-knowledge-foreground)"],
  ["#ecfdf5", "var(--html-visual-success-surface)"],
  ["#d1fae5", "var(--html-visual-success-surface)"],
  ["#f0fdf4", "var(--html-visual-success-surface)"],
  ["#dcfce7", "var(--html-visual-success-surface)"],
  ["#a7f3d0", "var(--html-visual-success-border)"],
  ["#6ee7b7", "var(--html-visual-success-border)"],
  ["#bbf7d0", "var(--html-visual-success-border)"],
  ["#86efac", "var(--html-visual-success-border)"],
  ["#34d399", "var(--html-visual-success-accent)"],
  ["#10b981", "var(--html-visual-success-accent)"],
  ["#4ade80", "var(--html-visual-success-accent)"],
  ["#22c55e", "var(--html-visual-success-accent)"],
  ["#16a34a", "var(--html-visual-success-accent)"],
  ["#047857", "var(--html-visual-success-foreground)"],
  ["#15803d", "var(--html-visual-success-foreground)"],
  ["#fffbeb", "var(--html-visual-warning-surface)"],
  ["#fef3c7", "var(--html-visual-warning-surface)"],
  ["#fde68a", "var(--html-visual-warning-border)"],
  ["#fcd34d", "var(--html-visual-warning-border)"],
  ["#fbbf24", "var(--html-visual-warning-accent)"],
  ["#f59e0b", "var(--html-visual-warning-accent)"],
  ["#d97706", "var(--html-visual-warning-accent)"],
  ["#92400e", "var(--html-visual-warning-foreground)"],
  ["#b45309", "var(--html-visual-warning-foreground)"],
  ["#fff1f2", "var(--html-visual-danger-surface)"],
  ["#ffe4e6", "var(--html-visual-danger-surface)"],
  ["#fecdd3", "var(--html-visual-danger-border)"],
  ["#fda4af", "var(--html-visual-danger-border)"],
  ["#fb7185", "var(--html-visual-danger-accent)"],
  ["#f43f5e", "var(--html-visual-danger-accent)"],
  ["#e11d48", "var(--html-visual-danger-accent)"],
  ["#be123c", "var(--html-visual-danger-foreground)"],
  ["#fef2f2", "var(--html-visual-danger-surface)"],
  ["#fee2e2", "var(--html-visual-danger-border)"],
  ["#fecaca", "var(--html-visual-danger-border)"],
  ["#f87171", "var(--html-visual-danger-accent)"],
  ["#ef4444", "var(--html-visual-danger-accent)"],
  ["#dc2626", "var(--html-visual-danger-accent)"],
  ["#b91c1c", "var(--html-visual-danger-foreground)"],
]);
const BACKGROUND_PROPERTIES = new Set(["background", "backgroundColor"]);
const BORDER_COLOR_PROPERTIES = new Set([
  "border",
  "borderBlock",
  "borderBlockEnd",
  "borderBlockStart",
  "borderBottom",
  "borderColor",
  "borderInline",
  "borderInlineEnd",
  "borderInlineStart",
  "borderLeft",
  "borderRight",
  "borderTop",
]);
const TABLE_CONTAINER_DECORATION_PROPERTIES = new Set([
  "background",
  "backgroundColor",
  "border",
  "borderBlock",
  "borderBlockEnd",
  "borderBlockStart",
  "borderBottom",
  "borderColor",
  "borderInline",
  "borderInlineEnd",
  "borderInlineStart",
  "borderLeft",
  "borderRadius",
  "borderRight",
  "borderStyle",
  "borderTop",
  "borderWidth",
  "boxShadow",
  "padding",
  "paddingBlock",
  "paddingBlockEnd",
  "paddingBlockStart",
  "paddingBottom",
  "paddingInline",
  "paddingInlineEnd",
  "paddingInlineStart",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
]);

function toCamelCase(property: string): string {
  const trimmed = property.trim();
  if (SAFE_STYLE_PROPERTIES.has(trimmed)) return trimmed;

  return trimmed
    .toLowerCase()
    .replace(/-+([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(value: string): ParsedColor | null {
  const hex = value.trim().replace(/^#/, "");
  if (![3, 4, 6, 8].includes(hex.length)) return null;

  const expand = (input: string) =>
    input.length === 1 ? `${input}${input}` : input;
  const channels =
    hex.length <= 4
      ? [
          expand(hex[0] || "0"),
          expand(hex[1] || "0"),
          expand(hex[2] || "0"),
          expand(hex[3] || "f"),
        ]
      : [
          hex.slice(0, 2),
          hex.slice(2, 4),
          hex.slice(4, 6),
          hex.slice(6, 8) || "ff",
        ];

  const [r, g, b, alpha] = channels.map((channel) =>
    Number.parseInt(channel, 16),
  );
  if ([r, g, b, alpha].some((channel) => Number.isNaN(channel))) return null;
  return { r, g, b, a: alpha / 255 };
}

function parseRgbChannel(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed);
    return Number.isFinite(percent)
      ? clamp((percent / 100) * 255, 0, 255)
      : null;
  }
  const channel = Number.parseFloat(trimmed);
  return Number.isFinite(channel) ? clamp(channel, 0, 255) : null;
}

function parseAlpha(value: string | undefined): number {
  if (!value) return 1;
  const trimmed = value.trim();
  if (trimmed.endsWith("%")) {
    const percent = Number.parseFloat(trimmed);
    return Number.isFinite(percent) ? clamp(percent / 100, 0, 1) : 1;
  }
  const alpha = Number.parseFloat(trimmed);
  return Number.isFinite(alpha) ? clamp(alpha, 0, 1) : 1;
}

function splitFunctionArgs(value: string): {
  channels: string[];
  alpha?: string;
} {
  const [channelPart, slashAlpha] = value.split(/\s+\/\s+/u, 2);
  if (channelPart.includes(",")) {
    const parts = channelPart.split(",").map((item) => item.trim());
    return { channels: parts.slice(0, 3), alpha: parts[3] ?? slashAlpha };
  }
  return {
    channels: channelPart.trim().split(/\s+/u).filter(Boolean),
    alpha: slashAlpha,
  };
}

function parseRgbColor(value: string): ParsedColor | null {
  const match = value.trim().match(/^rgba?\((.*)\)$/i);
  if (!match) return null;
  const { channels, alpha } = splitFunctionArgs(match[1] || "");
  if (channels.length !== 3) return null;

  const [r, g, b] = channels.map(parseRgbChannel);
  if (r === null || g === null || b === null) return null;
  return { r, g, b, a: parseAlpha(alpha) };
}

function hueToRgb(p: number, q: number, t: number): number {
  let normalized = t;
  if (normalized < 0) normalized += 1;
  if (normalized > 1) normalized -= 1;
  if (normalized < 1 / 6) return p + (q - p) * 6 * normalized;
  if (normalized < 1 / 2) return q;
  if (normalized < 2 / 3) return p + (q - p) * (2 / 3 - normalized) * 6;
  return p;
}

function parsePercent(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed.endsWith("%")) return null;
  const percent = Number.parseFloat(trimmed);
  return Number.isFinite(percent) ? clamp(percent / 100, 0, 1) : null;
}

function parseHue(value: string): number | null {
  const trimmed = value.trim().toLowerCase();
  const raw = Number.parseFloat(trimmed);
  if (!Number.isFinite(raw)) return null;
  if (trimmed.endsWith("turn")) return raw * 360;
  if (trimmed.endsWith("rad")) return (raw * 180) / Math.PI;
  return raw;
}

function parseHslColor(value: string): ParsedColor | null {
  const match = value.trim().match(/^hsla?\((.*)\)$/i);
  if (!match) return null;
  const { channels, alpha } = splitFunctionArgs(match[1] || "");
  if (channels.length !== 3) return null;

  const hue = parseHue(channels[0] || "");
  const saturation = parsePercent(channels[1] || "");
  const lightness = parsePercent(channels[2] || "");
  if (hue === null || saturation === null || lightness === null) return null;

  const normalizedHue = (((hue % 360) + 360) % 360) / 360;
  if (saturation === 0) {
    const channel = lightness * 255;
    return { r: channel, g: channel, b: channel, a: parseAlpha(alpha) };
  }

  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return {
    r: hueToRgb(p, q, normalizedHue + 1 / 3) * 255,
    g: hueToRgb(p, q, normalizedHue) * 255,
    b: hueToRgb(p, q, normalizedHue - 1 / 3) * 255,
    a: parseAlpha(alpha),
  };
}

function parseCssColor(value: string): ParsedColor | null {
  const normalized = value.trim().toLowerCase();
  if (normalized === "black") return { r: 0, g: 0, b: 0, a: 1 };
  if (normalized === "white") return { r: 255, g: 255, b: 255, a: 1 };
  if (normalized === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (normalized.startsWith("#")) return parseHexColor(normalized);
  if (normalized.startsWith("rgb")) return parseRgbColor(normalized);
  if (normalized.startsWith("hsl")) return parseHslColor(normalized);
  return null;
}

function isNearExtremeNeutral(
  color: ParsedColor,
  ignoreAlpha = false,
): boolean {
  if (!ignoreAlpha && color.a < 0.7) return false;
  const channels = [color.r, color.g, color.b];
  const min = Math.min(...channels);
  const max = Math.max(...channels);
  const average = (color.r + color.g + color.b) / 3;
  return max - min <= 12 && (average <= 32 || average >= 224);
}

function relativeLuminance(color: ParsedColor): number {
  const transform = (channel: number) => {
    const value = channel / 255;
    return value <= 0.03928
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  };
  return (
    0.2126 * transform(color.r) +
    0.7152 * transform(color.g) +
    0.0722 * transform(color.b)
  );
}

function contrastRatio(a: ParsedColor, b: ParsedColor): number {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

function replaceNeutralColors(value: string, replacement: string): string {
  const replaceIfNeutral = (match: string) => {
    const color = parseCssColor(match);
    return color && isNearExtremeNeutral(color) ? replacement : match;
  };

  return value
    .replace(HEX_COLOR_RE, replaceIfNeutral)
    .replace(RGB_OR_HSL_COLOR_RE, replaceIfNeutral)
    .replace(NEUTRAL_KEYWORD_RE, replaceIfNeutral);
}

function mapSingleThemeColor(value: string): string | null {
  return THEME_COLOR_TOKENS.get(value.trim().toLowerCase()) ?? null;
}

function mapHtmlVisualTokenForRole(
  value: string,
  role: "foreground" | "border",
): string | null {
  const normalized = value.trim().toLowerCase();
  const toneMatch = normalized.match(HTML_VISUAL_TONE_TOKEN_RE);
  if (toneMatch?.[1]) {
    return `var(--html-visual-${toneMatch[1]}-${role})`;
  }

  if (role === "foreground") {
    if (
      normalized === HTML_VISUAL_SURFACE ||
      normalized === HTML_VISUAL_SUBTLE_BORDER ||
      normalized === "var(--html-visual-border)"
    ) {
      return HTML_VISUAL_FOREGROUND;
    }
    if (normalized === "var(--markdown-soft-surface)") {
      return "var(--markdown-foreground)";
    }
    if (normalized === "var(--markdown-code-bg)") {
      return "var(--markdown-code-text)";
    }
    return null;
  }

  if (
    normalized === HTML_VISUAL_SURFACE ||
    normalized === HTML_VISUAL_FOREGROUND ||
    normalized === "var(--html-visual-border)"
  ) {
    return HTML_VISUAL_SUBTLE_BORDER;
  }
  return null;
}

function mapSingleThemeColorForRole(
  value: string,
  role: "foreground" | "border",
): string | null {
  return (
    mapHtmlVisualTokenForRole(value, role) ||
    mapHtmlVisualTokenForRole(mapSingleThemeColor(value) || "", role)
  );
}

function containsNeutralColor(value: string, ignoreAlpha = false): boolean {
  const matches = [
    ...value.matchAll(HEX_COLOR_RE),
    ...value.matchAll(RGB_OR_HSL_COLOR_RE),
    ...value.matchAll(NEUTRAL_KEYWORD_RE),
  ];
  return matches.some((match) => {
    const color = parseCssColor(match[0]);
    return Boolean(color && isNearExtremeNeutral(color, ignoreAlpha));
  });
}

function replaceThemeColorsForRole(
  value: string,
  role: "foreground" | "border",
): string {
  return value
    .replace(HEX_COLOR_RE, (match) => {
      return mapSingleThemeColorForRole(match, role) ?? match;
    })
    .replace(CSS_VARIABLE_RE, (match) => {
      return mapHtmlVisualTokenForRole(match, role) ?? match;
    });
}

function normalizeColorStyleValue(property: string, value: string): string {
  if (property === "boxShadow" && containsNeutralColor(value, true)) {
    return HTML_VISUAL_SHADOW;
  }

  if (BACKGROUND_PROPERTIES.has(property)) {
    const themeColor = mapSingleThemeColor(value);
    if (themeColor) return themeColor;
    if (COMPLEX_BACKGROUND_RE.test(value)) return HTML_VISUAL_SURFACE;
    const color = parseCssColor(value);
    if (color && isNearExtremeNeutral(color)) return HTML_VISUAL_SURFACE;
    return value;
  }

  if (property === "color") {
    return mapSingleThemeColorForRole(value, "foreground") ?? value;
  }

  if (BORDER_COLOR_PROPERTIES.has(property)) {
    return replaceNeutralColors(
      replaceThemeColorsForRole(value, "border"),
      HTML_VISUAL_SUBTLE_BORDER,
    );
  }

  return value;
}

function isSafeStyleValue(value: unknown): value is string | number {
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;

  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized.length <= 160 &&
    !UNSAFE_STYLE_VALUE_RE.test(normalized)
  );
}

function addSafeStyleValue(
  output: SafeStyleOutput,
  property: string,
  value: unknown,
) {
  const normalizedProperty = toCamelCase(property);
  if (!SAFE_STYLE_PROPERTIES.has(normalizedProperty)) return;
  if (!isSafeStyleValue(value)) return;

  output[normalizedProperty] =
    typeof value === "string"
      ? normalizeColorStyleValue(normalizedProperty, value.trim())
      : value;
}

function parseStyleAttribute(style: string): CSSProperties | undefined {
  const output: SafeStyleOutput = {};

  for (const declaration of style.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex <= 0) continue;

    addSafeStyleValue(
      output,
      declaration.slice(0, separatorIndex),
      declaration.slice(separatorIndex + 1),
    );
  }

  applyContrastCorrection(output);
  applyNeutralTextFallback(output);
  return Object.keys(output).length > 0 ? output : undefined;
}

export function sanitizeHtmlStyle(style: unknown): CSSProperties | undefined {
  if (!style) return undefined;
  if (typeof style === "string") return parseStyleAttribute(style);
  if (typeof style !== "object") return undefined;

  const output: SafeStyleOutput = {};
  for (const [property, value] of Object.entries(
    style as Record<string, unknown>,
  )) {
    addSafeStyleValue(output, property, value);
  }

  applyContrastCorrection(output);
  applyNeutralTextFallback(output);
  return Object.keys(output).length > 0 ? output : undefined;
}

export function sanitizeHtmlTableContainerStyle(
  style: unknown,
): CSSProperties | undefined {
  const output = sanitizeHtmlStyle(style);
  if (!output) return undefined;

  for (const property of TABLE_CONTAINER_DECORATION_PROPERTIES) {
    delete (output as SafeStyleOutput)[property];
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function applyContrastCorrection(output: SafeStyleOutput) {
  const textColor = typeof output.color === "string" ? output.color : undefined;
  if (!textColor) return;

  const text = parseCssColor(textColor);
  if (!text) return;

  const backgroundValue =
    typeof output.backgroundColor === "string"
      ? output.backgroundColor
      : typeof output.background === "string"
        ? output.background
        : undefined;
  if (!backgroundValue) return;

  const background = parseCssColor(backgroundValue);
  if (!background) return;

  if (contrastRatio(text, background) >= MIN_TEXT_CONTRAST_RATIO) return;

  output.color =
    relativeLuminance(background) > 0.5
      ? HTML_VISUAL_ON_LIGHT
      : HTML_VISUAL_ON_DARK;
}

function applyNeutralTextFallback(output: SafeStyleOutput) {
  if (typeof output.color !== "string") return;
  const color = parseCssColor(output.color);
  if (color && isNearExtremeNeutral(color)) {
    output.color = HTML_VISUAL_FOREGROUND;
  }
}
