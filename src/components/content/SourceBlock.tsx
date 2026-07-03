"use client";
import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Source, ImageSource } from "@/types";
import { LoaderCircle, BookOpen, ChevronDown } from "lucide-react";
import { useUIStore } from "@/store/core/uiStore";
import {
  getSafeFaviconProxyUrl,
  getSafeMarkdownImageSrc,
  getSafeWebHref,
} from "@/lib/security/clientUrl";
import { getSourceBlockPresentation } from "@/lib/search/sourceBlock";

interface SourceBlockProps {
  sources: Source[];
  images: ImageSource[];
  isSearching?: boolean;
}

const SourceBlock: React.FC<SourceBlockProps> = ({
  sources,
  images,
  isSearching,
}) => {
  const t = useTranslations("Content");
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();
  const { openImagePreview } = useUIStore();
  const safeImages = images
    .map((image) => ({
      ...image,
      url: getSafeMarkdownImageSrc(image.url) || "",
    }))
    .filter((image) => image.url);

  const visibleImagesCount = 4;
  const presentation = getSourceBlockPresentation({
    sourceCount: sources.length,
    imageCount: safeImages.length,
    isSearching,
    visibleImagesCount,
  });

  if (!presentation.shouldRender) return null;

  // Localized header label (mirrors getSourceBlockPresentation's label logic,
  // which stays English for non-UI consumers).
  const presentationLabel = isSearching
    ? t("labelSearching")
    : presentation.hasSources && presentation.hasImages
      ? t("labelSourcesAndImages")
      : presentation.hasImages
        ? t("labelImages")
        : t("labelSources");

  const handleImageClick = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    const previewImages = safeImages.map((img) => ({
      url: img.url,
      alt: img.description,
      description: img.description,
    }));
    openImagePreview(previewImages, index);
  };

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 transition-[border-color,background-color,box-shadow] duration-300 dark:border-border dark:bg-muted/30">
      <button
        type="button"
        disabled={isSearching}
        aria-expanded={isExpanded && !isSearching}
        aria-controls={panelId}
        aria-busy={isSearching || undefined}
        onClick={() => !isSearching && setIsExpanded(!isExpanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 dark:text-muted-foreground transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 ${isSearching ? "cursor-wait" : "cursor-pointer hover:bg-gray-100/50 dark:hover:bg-accent/30"}`}
      >
        {isSearching ? (
          <LoaderCircle
            size={14}
            className="animate-spin text-blue-500"
            aria-hidden="true"
          />
        ) : (
          <BookOpen size={14} className="text-blue-500" aria-hidden="true" />
        )}
        <span className="flex-1 text-left truncate">{presentationLabel}</span>
        {!isSearching && (
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        )}
      </button>

      {/* Animated Expansion Container */}
      <div
        id={panelId}
        role="region"
        aria-label={t("searchSourcesAndImages")}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isExpanded && !isSearching ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          {/* Lazy Render Content */}
          {isExpanded && !isSearching && (
            <div className="px-3 py-3 border-t border-gray-200/50 dark:border-border bg-white/40 dark:bg-card/40">
              {/* Source List */}
              {presentation.hasSources && (
                <div className="space-y-2">
                  {sources.map((source, idx) => {
                    const safeHref = getSafeWebHref(source.url);
                    const hostname = safeHref ? new URL(safeHref).hostname : "";
                    const faviconUrl = getSafeFaviconProxyUrl(
                      safeHref || undefined,
                    );
                    const ItemComponent = safeHref ? "a" : "div";

                    return (
                      <ItemComponent
                        key={idx}
                        {...(safeHref
                          ? {
                              href: safeHref,
                              target: "_blank",
                              rel: "noopener noreferrer",
                            }
                          : {})}
                        className={`block p-3 rounded-lg transition-colors group/source text-left border border-transparent ${
                          safeHref
                            ? "hover:bg-gray-100 dark:hover:bg-muted hover:border-gray-200 dark:hover:border-border"
                            : "bg-gray-50/70 dark:bg-card/40 opacity-80"
                        }`}
                      >
                        {/* Line 1: Icon + Title */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="shrink-0 w-4 h-4 rounded-sm overflow-hidden bg-gray-200 dark:bg-accent">
                            {faviconUrl && (
                              <img
                                src={faviconUrl}
                                alt=""
                                aria-hidden="true"
                                width={16}
                                height={16}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                decoding="async"
                                referrerPolicy="no-referrer"
                                onError={(e) =>
                                  ((
                                    e.target as HTMLImageElement
                                  ).style.opacity = "0")
                                }
                              />
                            )}
                          </div>
                          <div className="text-xs font-bold text-gray-800 dark:text-foreground line-clamp-1 group-hover/source:text-blue-600 dark:group-hover/source:text-blue-400 transition-colors">
                            {source.title}
                          </div>
                        </div>

                        {/* Line 2: Hostname */}
                        <div className="text-[10px] text-gray-500 dark:text-muted-foreground mb-1.5">
                          {hostname}
                        </div>

                        {/* Line 3: Snippet */}
                        {source.content && (
                          <div className="text-[11px] text-gray-600 dark:text-foreground/85 line-clamp-2 leading-relaxed opacity-90">
                            {source.content}
                          </div>
                        )}
                      </ItemComponent>
                    );
                  })}
                </div>
              )}

              {/* Image Gallery */}
              {presentation.hasImages && (
                <div
                  className={
                    presentation.hasSources
                      ? "mt-4 pt-3 border-t border-gray-200/50 dark:border-border"
                      : ""
                  }
                >
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {safeImages.slice(0, visibleImagesCount).map((img, idx) => {
                      const isLast = idx === visibleImagesCount - 1;
                      const showOverlay =
                        isLast && presentation.remainingImagesCount > 0;

                      return (
                        <button
                          type="button"
                          key={idx}
                          aria-label={
                            img.description
                              ? t("previewImageDescAria", {
                                  description: img.description,
                                })
                              : t("previewImageIndexAria", { index: idx + 1 })
                          }
                          className="relative h-24 rounded-lg overflow-hidden border border-gray-200 dark:border-border group/img bg-gray-100 dark:bg-muted cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
                          onClick={(e) => handleImageClick(e, idx)}
                        >
                          <img
                            src={img.url}
                            alt={
                              img.description || t("resultAlt", { index: idx })
                            }
                            width={320}
                            height={180}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover/img:scale-110"
                            loading="lazy"
                            decoding="async"
                            referrerPolicy="no-referrer"
                            onError={(e) =>
                              ((e.target as HTMLImageElement).style.opacity =
                                "0.5")
                            }
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/10 transition-colors" />

                          {/* Overlay for +N images */}
                          {showOverlay && (
                            <div className="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center text-white font-medium text-xs z-10 transition-colors hover:bg-black/70">
                              {t("moreImages", {
                                count: presentation.remainingImagesCount,
                              })}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SourceBlock;
