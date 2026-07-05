"use client";
import React, { useId, useState } from "react";
import { Lightbulb, LoaderCircle, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import MarkdownRenderer from "./MarkdownRenderer";
import { extractReasoningTitle } from "@/lib/utils/reasoningDisplay";

interface ReasoningBlockProps {
  reasoning: string;
  isThinking: boolean;
}

const ReasoningBlock: React.FC<ReasoningBlockProps> = ({
  reasoning,
  isThinking,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();

  const t = useTranslations("Content");

  // Dynamic Title Logic
  const dynamicTitle = reasoning ? extractReasoningTitle(reasoning) : null;
  const reasoningLabel = isThinking
    ? dynamicTitle || t("thinking")
    : t("thoughtProcess");

  if (!reasoning) return null;

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 transition-[border-color,background-color,box-shadow] duration-300 dark:border-border dark:bg-muted/30">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-busy={isThinking || undefined}
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 dark:text-muted-foreground hover:bg-gray-100/50 dark:hover:bg-accent/30 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
      >
        <span className="rounded bg-violet-100 p-1 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
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

        <span className="flex-1 text-left truncate">{reasoningLabel}</span>

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
