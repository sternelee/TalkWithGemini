import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import {
  absoluteUrl,
  getSeoOpenGraphImages,
  getSeoContent,
  getSiteUrl,
  normalizeSeoLocale,
  SITE_NAME,
} from "@/lib/seo";
import {
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  THEME_INIT_SCRIPT,
} from "@/lib/themeInitScript";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = normalizeSeoLocale(await getLocale());
  const seo = getSeoContent(locale);
  const ogImages = getSeoOpenGraphImages(seo.ogImageAlt);
  const primaryOgImage = ogImages[0]?.url ?? absoluteUrl("/desktop.png");

  return {
    metadataBase: new URL(getSiteUrl()),
    applicationName: SITE_NAME,
    title: {
      default: seo.title,
      template: `%s | ${SITE_NAME}`,
    },
    description: seo.description,
    keywords: seo.keywords,
    manifest: "/manifest.webmanifest",
    alternates: {
      canonical: "/",
    },
    icons: {
      icon: [
        { url: "/favicon.ico" },
        { url: "/logo.png", sizes: "192x192", type: "image/png" },
      ],
      apple: [{ url: "/logo.png", sizes: "192x192", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: SITE_NAME,
      statusBarStyle: "default",
    },
    openGraph: {
      type: "website",
      url: "/",
      siteName: SITE_NAME,
      title: seo.ogTitle,
      description: seo.ogDescription,
      locale: seo.openGraphLocale,
      images: ogImages,
    },
    twitter: {
      card: "summary_large_image",
      title: seo.ogTitle,
      description: seo.ogDescription,
      images: [primaryOgImage],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: LIGHT_THEME_COLOR },
    { media: "(prefers-color-scheme: dark)", color: DARK_THEME_COLOR },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = normalizeSeoLocale(await getLocale());

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="antialiased">
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
