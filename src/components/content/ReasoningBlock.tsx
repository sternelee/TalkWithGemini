"use client";
import React, { useEffect, useId, useState } from "react";
import { Lightbulb, LoaderCircle, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import MarkdownRenderer from "./MarkdownRenderer";
import { extractReasoningTitle } from "@/lib/utils/reasoningDisplay";

interface ReasoningBlockProps {
  reasoning: string;
  isThinking: boolean;
  durationMs?: number;
}

function formatReasoningDuration(durationMs?: number): string | null {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs)) {
    return null;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

const ReasoningBlock: React.FC<ReasoningBlockProps> = ({
  reasoning,
  isThinking,
  durationMs,
}) => {
  const [isExpanded, setIsExpanded] = useState(isThinking);
  const panelId = useId();

  const t = useTranslations("Content");

  // Dynamic Title Logic
  const dynamicTitle = reasoning ? extractReasoningTitle(reasoning) : null;
  const reasoningLabel = isThinking
    ? dynamicTitle || t("thinking")
    : t("thoughtProcess");
  const durationLabel = !isThinking
    ? formatReasoningDuration(durationMs)
    : null;

  useEffect(() => {
    setIsExpanded(isThinking);
  }, [isThinking]);

  if (!reasoning) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 transition-[border-color,background-color,box-shadow] duration-300 dark:border-border dark:bg-muted/30">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-busy={isThinking || undefined}
        onClick={() => setIsExpanded((expanded) => !expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 dark:text-muted-foreground hover:bg-gray-100/50 dark:hover:bg-accent/30 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded text-violet-600 dark:text-violet-400">
          {isThinking ? (
            <LoaderCircle
              size={12}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Lightbulb size={12} aria-hidden="true" />
          )}
        </span>

        <span className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="truncate">{reasoningLabel}</span>
          {durationLabel ? (
            <span
              className="shrink-0 text-[11px] font-normal tabular-nums text-muted-foreground"
              aria-label={t("thoughtDuration", { duration: durationLabel })}
            >
              {durationLabel}
            </span>
          ) : null}
        </span>

        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-label={t("thoughtProcessDetails")}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-2 border-t border-gray-200/50 dark:border-border bg-white/40 dark:bg-card/40 text-gray-600 dark:text-foreground/85 text-sm max-h-72 overflow-y-auto custom-scrollbar">
            <MarkdownRenderer
              content={reasoning}
              className="text-gray-600 dark:text-foreground/85 text-xs! md:text-sm!"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReasoningBlock;
