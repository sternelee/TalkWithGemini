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
        sizes: "1920x1045",
        type: "image/png",
        form_factor: "wide",
        label: "Neo Chat desktop workspace screenshot",
      },
      {
        src: "/mobile.png",
        sizes: "1498x1328",
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

  it("builds screenshot URLs from NEXT_PUBLIC_SITE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://chat.example.com/");

    expect(seo.getSeoScreenshotUrls()).toEqual([
      "https://chat.example.com/desktop.png",
      "https://chat.example.com/mobile.png",
    ]);
    expect(seo.getSeoOpenGraphImages("Neo Chat")[0]).toMatchObject({
      url: "https://chat.example.com/desktop.png",
      width: 1920,
      height: 1045,
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
