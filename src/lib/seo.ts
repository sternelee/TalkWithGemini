export const SITE_NAME = "Neo Chat";

const DEFAULT_SITE_URL = "http://localhost:3000";
const DESKTOP_SCREENSHOT_SRC = "/desktop.png" as const;
const MOBILE_SCREENSHOT_SRC = "/mobile.png" as const;

export type SeoLocale = "en" | "zh";

type SeoContent = {
  title: string;
  description: string;
  keywords: string[];
  ogTitle: string;
  ogDescription: string;
  ogImageAlt: string;
  openGraphLocale: string;
  structuredDataLanguage: string;
  features: string[];
};

type SeoScreenshotSrc =
  | typeof DESKTOP_SCREENSHOT_SRC
  | typeof MOBILE_SCREENSHOT_SRC;

type SeoScreenshot = {
  src: SeoScreenshotSrc;
  sizes: string;
  type: "image/png";
  form_factor: "wide" | "narrow";
  label: string;
};

type SeoScreenshotDimensions = {
  width: number;
  height: number;
};

export const SEO_SCREENSHOTS: SeoScreenshot[] = [
  {
    src: DESKTOP_SCREENSHOT_SRC,
    sizes: "1920x1045",
    type: "image/png",
    form_factor: "wide",
    label: "Neo Chat desktop workspace screenshot",
  },
  {
    src: MOBILE_SCREENSHOT_SRC,
    sizes: "1498x1328",
    type: "image/png",
    form_factor: "narrow",
    label: "Neo Chat mobile workspace screenshot",
  },
];

const SEO_SCREENSHOT_DIMENSIONS: Record<
  SeoScreenshotSrc,
  SeoScreenshotDimensions
> = {
  [DESKTOP_SCREENSHOT_SRC]: { width: 1920, height: 1045 },
  [MOBILE_SCREENSHOT_SRC]: { width: 1498, height: 1328 },
};

export const SEO_CONTENT: Record<SeoLocale, SeoContent> = {
  en: {
    title: "Neo Chat - Local-first AI chat workspace",
    description:
      "Neo Chat is a local-first AI chat workspace for multi-model conversations, assistant presets, plugin tools, web search, knowledge-base RAG, voice, and artifacts.",
    keywords: [
      "Neo Chat",
      "AI chat",
      "local-first AI",
      "multi-model chat",
      "AI assistant",
      "knowledge base RAG",
      "web search",
      "AI plugins",
      "voice input",
      "Next.js chat app",
    ],
    ogTitle: "Neo Chat - Local-first AI chat workspace",
    ogDescription:
      "Chat with multiple AI providers, assistants, plugins, web search, knowledge-base RAG, voice, and artifacts in one bilingual workspace.",
    ogImageAlt: "Neo Chat AI chat workspace",
    openGraphLocale: "en_US",
    structuredDataLanguage: "en",
    features: [
      "Multi-model AI conversations",
      "Assistant presets and custom assistants",
      "Plugin tools and web search",
      "Knowledge-base RAG",
      "Voice input and text-to-speech",
      "Markdown, math, code, citations, and artifacts",
    ],
  },
  zh: {
    title: "Neo Chat - 本地优先的 AI 对话工作台",
    description:
      "Neo Chat 是本地优先的 AI 对话工作台，支持多模型对话、助手预设、插件工具、联网搜索、知识库 RAG、语音和可编辑产物。",
    keywords: [
      "Neo Chat",
      "AI 对话",
      "本地优先 AI",
      "多模型聊天",
      "AI 助手",
      "知识库 RAG",
      "联网搜索",
      "AI 插件",
      "语音输入",
      "Next.js 聊天应用",
    ],
    ogTitle: "Neo Chat - 本地优先的 AI 对话工作台",
    ogDescription:
      "在一个双语工作台中使用多模型、助手、插件、联网搜索、知识库 RAG、语音和可编辑产物。",
    ogImageAlt: "Neo Chat AI 对话工作台",
    openGraphLocale: "zh_CN",
    structuredDataLanguage: "zh-CN",
    features: [
      "多模型 AI 对话",
      "助手预设与自定义助手",
      "插件工具与联网搜索",
      "知识库 RAG",
      "语音输入与语音合成",
      "Markdown、数学公式、代码、引用和可编辑产物",
    ],
  },
};

export function normalizeSeoLocale(locale: string | undefined): SeoLocale {
  return locale === "zh" ? "zh" : "en";
}

export function getSeoContent(locale: string | undefined): SeoContent {
  return SEO_CONTENT[normalizeSeoLocale(locale)];
}

export function getSiteUrl(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();

  if (!rawUrl) {
    return DEFAULT_SITE_URL;
  }

  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function absoluteUrl(path = "/"): string {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

export function getSeoScreenshotUrls(): string[] {
  return SEO_SCREENSHOTS.map((screenshot) => absoluteUrl(screenshot.src));
}

export function getSeoOpenGraphImages(alt: string) {
  return SEO_SCREENSHOTS.map((screenshot) => ({
    url: absoluteUrl(screenshot.src),
    ...SEO_SCREENSHOT_DIMENSIONS[screenshot.src],
    alt,
  }));
}

export function buildWebApplicationJsonLd(locale: string | undefined) {
  const seo = getSeoContent(locale);
  const screenshotUrls = getSeoScreenshotUrls();

  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: SITE_NAME,
    alternateName: ["Neo", "Neo Chat AI"],
    url: absoluteUrl("/"),
    applicationCategory: "ProductivityApplication",
    operatingSystem: "Web",
    description: seo.description,
    inLanguage: seo.structuredDataLanguage,
    image: screenshotUrls,
    screenshot: screenshotUrls,
    logo: absoluteUrl("/logo.png"),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: seo.features,
  };
}
