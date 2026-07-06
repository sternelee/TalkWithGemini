import { describe, expect, it } from "vitest";
import en from "../i18n/locales/en";
import ja from "../i18n/locales/ja";
import zh from "../i18n/locales/zh";

type Catalog = Record<string, unknown>;

/** Collect every leaf key path (dot-joined) from a nested message catalog. */
function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value as Catalog).flatMap(([key, child]) =>
    collectKeyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe("message catalog parity", () => {
  const enKeys = collectKeyPaths(en).sort();
  const jaKeys = collectKeyPaths(ja).sort();
  const zhKeys = collectKeyPaths(zh).sort();

  it("zh is missing no keys present in en", () => {
    const missingInZh = enKeys.filter((key) => !zhKeys.includes(key));
    expect(missingInZh).toEqual([]);
  });

  it("zh has no extra keys absent from en", () => {
    const extraInZh = zhKeys.filter((key) => !enKeys.includes(key));
    expect(extraInZh).toEqual([]);
  });

  it("ja is missing no keys present in en", () => {
    const missingInJa = enKeys.filter((key) => !jaKeys.includes(key));
    expect(missingInJa).toEqual([]);
  });

  it("ja has no extra keys absent from en", () => {
    const extraInJa = jaKeys.filter((key) => !enKeys.includes(key));
    expect(extraInJa).toEqual([]);
  });

  it("all catalogs expose an identical key set", () => {
    expect(zhKeys).toEqual(enKeys);
    expect(jaKeys).toEqual(enKeys);
  });
});
