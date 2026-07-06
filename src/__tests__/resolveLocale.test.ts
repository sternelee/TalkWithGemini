import { describe, expect, it, vi } from "vitest";

// `next/headers` pulls in `server-only` (throws on import outside RSC) and
// `request.ts` runs `getRequestConfig(...)` at module load. Stub both so we can
// import the real, pure `resolveLocale` without a Next.js request context.
vi.mock("next/headers", () => ({ cookies: vi.fn(), headers: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getRequestConfig: (fn: unknown) => fn,
}));

import { DEFAULT_LOCALE, resolveLocale } from "../i18n/request";

describe("resolveLocale", () => {
  it("uses a supported cookie value, ignoring Accept-Language", () => {
    expect(resolveLocale("zh", "en-US,en;q=0.9")).toBe("zh");
    expect(resolveLocale("en", "zh-CN,zh;q=0.9")).toBe("en");
    expect(resolveLocale("ja", "en-US,en;q=0.9")).toBe("ja");
  });

  it("falls back to Accept-Language when cookie is 'auto'", () => {
    expect(resolveLocale("auto", "zh-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(resolveLocale("auto", "en-GB,en;q=0.9")).toBe("en");
    expect(resolveLocale("auto", "ja-JP,ja;q=0.9,en;q=0.8")).toBe("ja");
  });

  it("falls back to Accept-Language when cookie is missing", () => {
    expect(resolveLocale(undefined, "zh-TW,zh;q=0.9")).toBe("zh");
    expect(resolveLocale(null, "en-US")).toBe("en");
  });

  it("honors q-value preference order over list order", () => {
    expect(resolveLocale(undefined, "en;q=0.5,zh;q=0.9")).toBe("zh");
    expect(resolveLocale(undefined, "zh;q=0.3,en;q=0.8")).toBe("en");
    expect(resolveLocale(undefined, "en;q=0.5,ja;q=0.9")).toBe("ja");
  });

  it("ignores an unsupported cookie and resolves from the header", () => {
    expect(resolveLocale("fr", "zh-CN,zh;q=0.9")).toBe("zh");
  });

  it("defaults to DEFAULT_LOCALE when nothing matches", () => {
    expect(resolveLocale(undefined, "fr-FR,de;q=0.8")).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(undefined, undefined)).toBe(DEFAULT_LOCALE);
    expect(resolveLocale("auto", "")).toBe(DEFAULT_LOCALE);
  });
});
