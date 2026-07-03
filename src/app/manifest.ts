import type { MetadataRoute } from "next";

import { getSeoContent, SEO_SCREENSHOTS, SITE_NAME } from "@/lib/seo";

export default function manifest(): MetadataRoute.Manifest {
  const seo = getSeoContent("en");

  return {
    name: SITE_NAME,
    short_name: SITE_NAME,
    description: seo.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#09090b",
    theme_color: "#09090b",
    screenshots: SEO_SCREENSHOTS,
    icons: [
      {
        src: "/logo.png",
        sizes: "192x192",
        type: "image/png",
      },
    ],
  };
}
