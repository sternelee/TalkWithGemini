import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  SUPPORTED_LOCALES,
  type Locale,
} from "./constants";

export { DEFAULT_LOCALE, LOCALE_COOKIE, SUPPORTED_LOCALES };
export type { Locale };

const isSupported = (value: string): value is Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value);

const localeLoaders: Record<Locale, () => Promise<Record<string, unknown>>> = {
  en: async () => (await import("./locales/en")).default,
  zh: async () => (await import("./locales/zh")).default,
  ja: async () => (await import("./locales/ja")).default,
};

/**
 * Resolve the active locale from a persisted cookie value, falling back to the
 * browser's `Accept-Language` header when the cookie is missing or set to
 * "auto". Always returns a supported locale (defaults to {@link DEFAULT_LOCALE}).
 *
 * Pure function — no I/O — so it can be unit tested directly.
 */
export function resolveLocale(
  cookieValue: string | undefined | null,
  acceptLanguage: string | undefined | null,
): Locale {
  if (cookieValue && cookieValue !== "auto" && isSupported(cookieValue)) {
    return cookieValue;
  }

  // Parse `Accept-Language` (e.g. "zh-CN,zh;q=0.9,en;q=0.8") in preference order.
  if (acceptLanguage) {
    const ordered = acceptLanguage
      .split(",")
      .map((part) => {
        const [tag, q] = part.trim().split(";q=");
        return { tag: tag.toLowerCase(), q: q ? parseFloat(q) : 1 };
      })
      .sort((a, b) => b.q - a.q);

    for (const { tag } of ordered) {
      const base = tag.split("-")[0];
      if (isSupported(base)) return base;
    }
  }

  return DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const locale = resolveLocale(
    cookieStore.get(LOCALE_COOKIE)?.value,
    headerStore.get("accept-language"),
  );

  return {
    locale,
    messages: await localeLoaders[locale](),
  };
});
