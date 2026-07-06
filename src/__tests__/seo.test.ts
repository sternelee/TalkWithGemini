import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as seo from "../lib/seo";

describe("SEO screenshot assets", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defines desktop and mobile screenshots for SEO surfaces", () => {
    expect((seo as { SEO_SCREENSHOTS?: unknown }).SEO_SCREENSHOTS).toEqual([
      {
        src: "/desktop.png",
        sizes: "2880x1568",
        type: "image/png",
        form_factor: "wide",
        label: "Neo Chat desktop workspace screenshot",
      },
      {
        src: "/mobile.png",
        sizes: "1490x1332",
        type: "image/png",
        form_factor: "narrow",
        label: "Neo Chat mobile workspace screenshot",
      },
    ]);
  });

  it("uses screenshots as structured data images", () => {
    expect(seo.buildWebApplicationJsonLd("en").image).toEqual([
      "http://localhost:3000/desktop.png",
      "http://localhost:3000/mobile.png",
    ]);
  });

  it("keeps Japanese metadata and structured data in Japanese", () => {
    expect(seo.normalizeSeoLocale("ja")).toBe("ja");
    expect(seo.getSeoContent("ja")).toMatchObject({
      openGraphLocale: "ja_JP",
      structuredDataLanguage: "ja-JP",
    });
    expect(seo.getSeoContent("ja").title).toContain("ローカル優先");
    expect(seo.buildWebApplicationJsonLd("ja")).toMatchObject({
      inLanguage: "ja-JP",
    });
  });

  it("builds screenshot URLs from NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://chat.example.com/");

    expect(seo.getSeoScreenshotUrls()).toEqual([
      "https://chat.example.com/desktop.png",
      "https://chat.example.com/mobile.png",
    ]);
    expect(seo.getSeoOpenGraphImages("Neo Chat")[0]).toMatchObject({
      url: "https://chat.example.com/desktop.png",
      width: 2880,
      height: 1568,
      alt: "Neo Chat",
    });
  });

  it("uses static screenshot assets instead of a dynamic Open Graph image route", () => {
    expect(
      existsSync(resolve(process.cwd(), "src/app/opengraph-image.tsx")),
    ).toBe(false);
    expect(
      seo.getSeoOpenGraphImages("Neo Chat").map((image) => image.url),
    ).toEqual([
      "http://localhost:3000/desktop.png",
      "http://localhost:3000/mobile.png",
    ]);
  });
});
