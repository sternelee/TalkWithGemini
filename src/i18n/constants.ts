export const SUPPORTED_LOCALES = ["en", "zh", "ja"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** Cookie name used to persist the interface language across requests. */
export const LOCALE_COOKIE = "NEXT_LOCALE";
