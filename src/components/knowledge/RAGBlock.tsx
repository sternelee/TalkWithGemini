"use client";
import React, { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Source } from "@/types";
import { Library, ChevronDown, BookText } from "lucide-react";

interface RAGBlockProps {
  sources: Source[];
}

const RAGBlock: React.FC<RAGBlockProps> = ({ sources }) => {
  const t = useTranslations("Knowledge");
  const [isExpanded, setIsExpanded] = useState(false);
  const contentId = useId();
  const buttonId = useId();

  if (!sources || sources.length === 0) return null;

  return (
    <div className="mb-3 rounded-lg border border-purple-200 dark:border-purple-800/60 overflow-hidden bg-purple-50/50 dark:bg-purple-900/10 transition-colors duration-300">
      <button
        id={buttonId}
        type="button"
        aria-expanded={isExpanded}
        aria-controls={contentId}
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-purple-700 dark:text-purple-300 hover:bg-purple-100/50 dark:hover:bg-purple-900/20 transition-colors select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
      >
        <Library
          size={14}
          className="text-purple-600 dark:text-purple-400"
          aria-hidden="true"
        />
        <span className="flex-1 text-left truncate">
          {t("sourcesHeading", { count: sources.length })}
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
        />
      </button>

      {/* Animated Expansion Container */}
      <div
        id={contentId}
        role="region"
        aria-labelledby={buttonId}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          {isExpanded && (
            <div className="px-3 py-3 border-t border-purple-200/50 dark:border-purple-800/50 bg-white/40 dark:bg-card/40">
              {/* Source List */}
              <div className="space-y-2">
                {sources.map((source, idx) => {
                  return (
                    <div
                      key={idx}
                      className="block p-3 rounded-lg bg-white/60 dark:bg-muted/60 border border-purple-100 dark:border-purple-900/30"
                    >
                      {/* Line 1: Icon + Title */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className="shrink-0 w-4 h-4 rounded-sm overflow-hidden bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                          <BookText size={10} aria-hidden="true" />
                        </div>
                        <div className="text-xs font-bold text-gray-800 dark:text-foreground line-clamp-1">
                          {source.title}
                        </div>
                      </div>

                      {/* Line 2: Snippet */}
                      {source.content && (
                        <div className="text-[11px] text-gray-600 dark:text-foreground/85 line-clamp-3 leading-relaxed opacity-90 font-mono">
                          {source.content}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RAGBlock;
