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
    <div className="mb-3 rounded-lg border border-gray-200 dark:border-border overflow-hidden bg-gray-50/50 dark:bg-muted/30">
      <div className="w-full flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-muted-foreground transition-colors select-none">
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          aria-busy={isThinking || undefined}
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-gray-100/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:hover:bg-accent/30"
        >
          {isThinking ? (
            <LoaderCircle
              size={14}
              className="shrink-0 animate-spin text-violet-500 dark:text-violet-400"
              aria-hidden="true"
            />
          ) : (
            <Lightbulb
              size={14}
              className="shrink-0 text-violet-500 dark:text-violet-400"
              aria-hidden="true"
            />
          )}
          <span className="flex-1 truncate">{reasoningLabel}</span>
        </button>

        <button
          type="button"
          aria-expanded={isExpanded}
          aria-controls={panelId}
          onClick={() => setIsExpanded(!isExpanded)}
          className="mr-2 rounded p-1 transition-colors hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:hover:bg-accent/80"
        >
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        id={panelId}
        role="region"
        aria-label={t("thoughtProcessDetails")}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-2 border-t border-gray-200/50 dark:border-border text-gray-600 dark:text-foreground/85 text-sm bg-white/40 dark:bg-card/40 max-h-72 overflow-y-auto custom-scrollbar">
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
