"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, PencilSparkles } from "lucide-react";
import Tooltip from "../ui/Tooltip";
import { getTaskModel } from "@/store/core/settingsStore";
import { streamGenerateContent } from "@/services/api/chatService";
import { polishTextContent } from "@/services/artifactService";
import { logDevError } from "@/lib/utils/devLogger";

interface UserMessageEditorProps {
  initialContent: string;
  onCancel: () => void;
  onSubmit: (content: string) => void | Promise<void>;
}

const actionButtonFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background";

const logUserMessageEditorError = logDevError;

const UserMessageEditor = ({
  initialContent,
  onCancel,
  onSubmit,
}: UserMessageEditorProps) => {
  const t = useTranslations("Message");
  const [draft, setDraft] = useState(initialContent);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);
  const [polishError, setPolishError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mountedRef = useRef(true);
  const polishRunRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      polishRunRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea || typeof window === "undefined") return;
    if (!window.matchMedia("(min-width: 768px)").matches) return;

    requestAnimationFrame(() => {
      textarea.focus({ preventScroll: true });
    });
  }, []);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft]);

  const handlePolish = async () => {
    const originalText = draft;
    if (!originalText.trim() || isPolishing || isSubmitting) return;

    const runId = polishRunRef.current + 1;
    polishRunRef.current = runId;
    setIsPolishing(true);
    setPolishError(null);

    try {
      let replacement = "";
      await streamGenerateContent(
        getTaskModel("promptOptimization"),
        polishTextContent(originalText),
        (text) => {
          if (!mountedRef.current || polishRunRef.current !== runId) return;
          replacement = text;
          setDraft(text);
        },
      );

      if (!mountedRef.current || polishRunRef.current !== runId) return;
      if (!replacement.trim()) {
        setDraft(originalText);
        setPolishError(t("polishUserMessageFailed"));
      }
    } catch (error) {
      logUserMessageEditorError("Failed to polish user message", error);
      if (mountedRef.current && polishRunRef.current === runId) {
        setDraft(originalText);
        setPolishError(t("polishUserMessageFailed"));
      }
    } finally {
      if (mountedRef.current && polishRunRef.current === runId) {
        setIsPolishing(false);
      }
    }
  };

  const handleSubmit = async () => {
    if (!draft.trim() || isSubmitting || isPolishing) return;
    if (draft === initialContent) {
      onCancel();
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(draft);
    } finally {
      if (mountedRef.current) {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="rounded-lg border border-input bg-background shadow-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background">
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          setPolishError(null);
        }}
        className="max-h-72 min-h-28 w-full resize-none bg-transparent px-3 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-ring"
        aria-label={t("editUserMessageAria")}
      />
      {polishError ? (
        <div className="px-3 pb-2 text-xs text-red-600 dark:text-red-300">
          {polishError}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-3 border-t border-border/70 px-2 py-2">
        <Tooltip
          content={
            isPolishing ? t("polishingUserMessage") : t("polishUserMessage")
          }
          position="top"
        >
          <button
            type="button"
            aria-label={t("polishUserMessageAria")}
            aria-busy={isPolishing || undefined}
            onClick={handlePolish}
            disabled={!draft.trim() || isPolishing || isSubmitting}
            className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-transparent px-2 text-xs font-medium text-gray-600 transition-[background-color,border-color,color,opacity] hover:border-white/40 hover:bg-gray-100 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-foreground/85 dark:hover:border-border dark:hover:bg-accent dark:hover:text-foreground ${actionButtonFocusClass}`}
          >
            {isPolishing ? (
              <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
              <PencilSparkles size={14} aria-hidden="true" />
            )}
            <span>{t("polishUserMessageShort")}</span>
          </button>
        </Tooltip>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 ${actionButtonFocusClass}`}
          >
            {t("cancelEdit")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!draft.trim() || isSubmitting || isPolishing}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-foreground dark:text-background ${actionButtonFocusClass}`}
          >
            {isSubmitting ? (
              <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            ) : null}
            {t("sendEdit")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UserMessageEditor;
