"use client";

import { ExternalLink, GitBranch, Globe2, Package, Scale } from "lucide-react";
import { useTranslations } from "next-intl";
import { Logo } from "../ui/Icons";

const PROJECT_NAME = "Neo Chat";
const PROJECT_VERSION = "2.1.0";
const OFFICIAL_SITE_URL = "https://neo.u14.app";
const OFFICIAL_REPO_URL = "https://github.com/u14app/neo-chat";
const LICENSE_URL = "https://github.com/u14app/neo-chat/blob/main/LICENSE";
const COPYRIGHT_TEXT = "Copyright (c) 2026 Neo Chat contributors";

function getDisplayHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  }
}

const AboutSettings = () => {
  const t = useTranslations("About");
  const siteHost = getDisplayHost(OFFICIAL_SITE_URL);

  const aboutProductInfo = [
    {
      label: t("website"),
      value: siteHost,
      href: OFFICIAL_SITE_URL,
      Icon: Globe2,
    },
    {
      label: t("officialRepo"),
      value: "u14app/neo-chat",
      href: OFFICIAL_REPO_URL,
      Icon: GitBranch,
    },
    {
      label: t("version"),
      value: `v${PROJECT_VERSION}`,
      Icon: Package,
    },
    {
      label: t("license"),
      value: "MIT License",
      href: LICENSE_URL,
      Icon: Scale,
    },
  ];

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <section className="aboutHero space-y-6">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-foreground">
          {t("title")}
        </h2>
        <div className="space-y-5">
          <div className="flex items-end gap-4">
            <Logo className="h-20 w-20 shrink-0" aria-hidden="true" />
            <div className="min-w-0 pb-1">
              <div className="text-3xl font-semibold tracking-normal text-foreground md:text-4xl">
                {PROJECT_NAME}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span>{t("client")}</span>
                <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-xs font-medium text-foreground ring-1 ring-border">
                  v{PROJECT_VERSION}
                </span>
              </div>
            </div>
          </div>
          <p className="max-w-4xl text-base leading-8 text-muted-foreground">
            {t("description")}
          </p>
        </div>
      </section>

      <section className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-foreground">
          {t("productInfo")}
        </h3>
        <div className="aboutProductInfo grid gap-x-12 md:grid-cols-2">
          {aboutProductInfo.map(({ label, value, href, Icon }) => {
            const content = (
              <>
                <span className="truncate font-medium text-foreground">
                  {value}
                </span>
                {href ? (
                  <ExternalLink
                    size={14}
                    className="shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : null}
              </>
            );

            return (
              <div
                key={label}
                className="flex min-h-14 items-center justify-between gap-5 border-b border-border/80 py-3"
              >
                <div className="flex min-w-0 items-center gap-3 text-muted-foreground">
                  <Icon size={18} className="shrink-0" aria-hidden="true" />
                  <span className="truncate text-sm">{label}</span>
                </div>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="flex min-w-0 items-center gap-2 text-right text-sm transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {content}
                  </a>
                ) : (
                  <div className="flex min-w-0 items-center gap-2 text-right text-sm">
                    {content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <footer className="space-y-1 pt-2 text-sm text-muted-foreground">
        <div>{COPYRIGHT_TEXT}</div>
        <a
          href={LICENSE_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 font-medium transition-colors hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("licensedUnder", { license: "MIT License" })}
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </footer>
    </div>
  );
};

export default AboutSettings;
