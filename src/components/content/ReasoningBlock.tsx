"use client";
import React, { useId, useState, useEffect, useRef } from "react";
import {
  Lightbulb,
  LoaderCircle,
  ChevronDown,
  Languages,
  Undo2,
  Check,
  Copy,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import MarkdownRenderer from "./MarkdownRenderer";
import Tooltip from "../ui/Tooltip";
import { streamGenerateContent } from "@/services/api/chatService";
import { useChatStore } from "@/store/core/chatStore";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import {
  createReasoningTranslationPrompt,
  extractReasoningTitle,
} from "@/lib/utils/reasoningDisplay";
import { copyTextToClipboard } from "@/lib/utils/clipboard";
import {
  createTimedStatusResetController,
  type TimedStatusResetController,
} from "@/lib/utils/timedStatus";

interface ReasoningBlockProps {
  reasoning: string;
  isThinking: boolean;
}

type CopyStatus = "idle" | "copied" | "error";

const ReasoningBlock: React.FC<ReasoningBlockProps> = ({
  reasoning,
  isThinking,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [translatedReasoning, setTranslatedReasoning] = useState<string | null>(
    null,
  );
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  const [wasTranslationTruncated, setWasTranslationTruncated] = useState(false);
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const isCopied = copyStatus === "copied";
  const translationRunIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const copyStatusResetRef =
    useRef<TimedStatusResetController<CopyStatus> | null>(null);
  const panelId = useId();

  const t = useTranslations("Content");
  const { selectedModel } = useChatStore();
  const { language } = useCoreSettingsStore();

  const setCopyFeedback = (status: Exclude<CopyStatus, "idle">) => {
    const controller =
      copyStatusResetRef.current ||
      createTimedStatusResetController<CopyStatus>({
        setStatus: setCopyStatus,
        resetValue: "idle",
      });
    copyStatusResetRef.current = controller;
    controller.set(status);
  };

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      translationRunIdRef.current += 1;
      copyStatusResetRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    translationRunIdRef.current += 1;
    setTranslatedReasoning(null);
    setTranslationError(null);
    setWasTranslationTruncated(false);
    setIsTranslating(false);
  }, [reasoning]);

  const displayReasoning =
    translatedReasoning !== null ? translatedReasoning : reasoning;

  // Dynamic Title Logic
  const dynamicTitle = displayReasoning
    ? extractReasoningTitle(displayReasoning)
    : null;
  const reasoningLabel = isThinking
    ? dynamicTitle || t("thinking")
    : t("thoughtProcess");

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (displayReasoning) {
      const copied = await copyTextToClipboard(displayReasoning);
      setCopyFeedback(copied ? "copied" : "error");
    }
  };

  const handleTranslate = async (e: React.MouseEvent) => {
    e.stopPropagation();

    // Undo Translation
    if (translatedReasoning !== null) {
      setTranslatedReasoning(null);
      setTranslationError(null);
      setWasTranslationTruncated(false);
      return;
    }

    const textToTranslate = reasoning;
    if (!textToTranslate) return;

    const runId = translationRunIdRef.current + 1;
    translationRunIdRef.current = runId;
    setIsTranslating(true);
    setTranslationError(null);
    setTranslatedReasoning(""); // Start empty

    const targetLang =
      language === "zh"
        ? "Simplified Chinese"
        : language === "en"
          ? "English"
          : "the current user interface language";
    const { prompt, truncated } = createReasoningTranslationPrompt(
      textToTranslate,
      targetLang,
    );
    setWasTranslationTruncated(truncated);

    try {
      await streamGenerateContent(selectedModel, prompt, (chunk) => {
        if (!isMountedRef.current || translationRunIdRef.current !== runId) {
          return;
        }
        setTranslatedReasoning((prev) => (prev || "") + chunk);
      });
    } catch (err) {
      if (isMountedRef.current && translationRunIdRef.current === runId) {
        setTranslatedReasoning(null);
        setWasTranslationTruncated(false);
        setTranslationError(
          err instanceof Error
            ? t("translationFailedWithError", { error: err.message })
            : t("translationFailed"),
        );
      }
    } finally {
      if (isMountedRef.current && translationRunIdRef.current === runId) {
        setIsTranslating(false);
      }
    }
  };

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
              className="shrink-0 animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Lightbulb size={14} className="shrink-0" aria-hidden="true" />
          )}
          <span className="flex-1 truncate">{reasoningLabel}</span>
        </button>

        {/* Action Buttons - Fade in when expanded */}
        <div
          aria-hidden={!isExpanded}
          className={`flex items-center gap-1 mr-2 transition-opacity duration-300 ${isExpanded ? "opacity-100 delay-100" : "opacity-0 pointer-events-none"}`}
        >
          {/* Translate Button */}
          <Tooltip
            content={
              translatedReasoning
                ? t("undoTranslation")
                : t("translateThinking")
            }
            position="top"
          >
            <button
              type="button"
              aria-label={
                translatedReasoning
                  ? t("undoTranslationAria")
                  : t("translateThinkingAria")
              }
              aria-busy={isTranslating || undefined}
              tabIndex={isExpanded ? 0 : -1}
              className="p-1 hover:bg-gray-200 dark:hover:bg-accent/80 rounded text-gray-500 dark:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              onClick={handleTranslate}
              disabled={isTranslating}
            >
              {isTranslating ? (
                <LoaderCircle
                  size={12}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : translatedReasoning ? (
                <Undo2 size={12} aria-hidden="true" />
              ) : (
                <Languages size={12} aria-hidden="true" />
              )}
            </button>
          </Tooltip>

          {/* Copy Button */}
          <Tooltip
            content={
              isCopied
                ? t("copied")
                : copyStatus === "error"
                  ? t("copyFailed")
                  : t("copyThinking")
            }
            position="top"
          >
            <button
              type="button"
              aria-label={
                isCopied
                  ? t("reasoningCopiedAria")
                  : copyStatus === "error"
                    ? t("copyReasoningFailedAria")
                    : t("copyReasoningAria")
              }
              tabIndex={isExpanded ? 0 : -1}
              className="p-1 hover:bg-gray-200 dark:hover:bg-accent/80 rounded text-gray-500 dark:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
              onClick={handleCopy}
            >
              {isCopied ? (
                <Check
                  size={12}
                  className="text-green-500"
                  aria-hidden="true"
                />
              ) : copyStatus === "error" ? (
                <X size={12} className="text-red-500" aria-hidden="true" />
              ) : (
                <Copy size={12} aria-hidden="true" />
              )}
              <span className="sr-only" aria-live="polite">
                {isCopied
                  ? t("reasoningCopiedAria")
                  : copyStatus === "error"
                    ? t("copyReasoningFailedAria")
                    : t("copyReasoningAria")}
              </span>
            </button>
          </Tooltip>
        </div>

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
            {translationError ? (
              <div
                role="status"
                aria-live="polite"
                className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
              >
                {translationError}
              </div>
            ) : null}
            {wasTranslationTruncated && translatedReasoning !== null ? (
              <div
                role="status"
                aria-live="polite"
                className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
              >
                {t("reasoningShortened")}
              </div>
            ) : null}
            {isTranslating && !displayReasoning ? (
              <div
                role="status"
                aria-live="polite"
                className="flex items-center gap-2 text-gray-400 italic"
              >
                <LoaderCircle
                  size={12}
                  className="animate-spin"
                  aria-hidden="true"
                />{" "}
                {t("translating")}
              </div>
            ) : (
              <MarkdownRenderer
                content={displayReasoning || ""}
                className="text-gray-600 dark:text-foreground/85 text-xs! md:text-sm!"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReasoningBlock;
