import React, { useState, useEffect, useRef, useId } from "react";
import {
  BotMessageSquare,
  Save,
  X,
  PenLine,
  Sparkles,
  Loader2,
} from "lucide-react";
import { optimizeSystemPrompt } from "@/services/artifactService";
import { streamGenerateContent } from "@/services/api/chatService";
import { getTaskModel } from "@/store/core/settingsStore";
import MarkdownRenderer from "../content/MarkdownRenderer";
import Tooltip from "../ui/Tooltip";
import { createStreamingReplacement } from "@/lib/utils/streamingText";
import { logDevError } from "@/lib/utils/devLogger";
import { useTranslations } from "next-intl";

interface AssistantHeaderProps {
  instruction: string;
  onUpdate: (newInstruction: string) => void;
  onDelete?: () => void;
}

const logAssistantHeaderError = logDevError;

const iconButtonFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background";

const AssistantHeader: React.FC<AssistantHeaderProps> = ({
  instruction,
  onUpdate,
  onDelete,
}) => {
  const t = useTranslations("Assistant");
  const [isEditing, setIsEditing] = useState(false);
  const [content, setContent] = useState(instruction);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isMountedRef = useRef(true);
  const optimizeRunRef = useRef(0);
  const isEditingRef = useRef(isEditing);
  const textareaId = useId();
  const optimizeErrorId = useId();

  useEffect(() => {
    optimizeRunRef.current += 1;
    setContent(instruction);
    setOptimizeError("");
    setIsOptimizing(false);
  }, [instruction]);

  useEffect(() => {
    isEditingRef.current = isEditing;
  }, [isEditing]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      optimizeRunRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
      textareaRef.current.focus();
    }
  }, [isEditing]);

  const handleSave = () => {
    onUpdate(content);
    setIsEditing(false);
  };

  const handleOptimize = async () => {
    if (!content.trim() || isOptimizing) return;

    const runId = optimizeRunRef.current + 1;
    optimizeRunRef.current = runId;
    setIsOptimizing(true);
    setOptimizeError("");
    const originalContent = content;
    const replacement = createStreamingReplacement(originalContent);
    const prompt = optimizeSystemPrompt(content);

    // Use the configured model for prompt optimization
    const model = getTaskModel("promptOptimization");

    try {
      await streamGenerateContent(model, prompt, (chunk) => {
        if (!isMountedRef.current || optimizeRunRef.current !== runId) {
          return;
        }
        setContent(replacement.append(chunk));
      });
      if (!isMountedRef.current || optimizeRunRef.current !== runId) {
        return;
      }
      const optimizedText = replacement.value();
      if (!optimizedText.trim()) {
        throw new Error("Prompt optimization returned empty content");
      }
      setContent(optimizedText);

      // If not in edit mode, auto-save the optimization
      if (!isEditingRef.current) {
        onUpdate(optimizedText);
      }
    } catch (e) {
      if (!isMountedRef.current || optimizeRunRef.current !== runId) {
        return;
      }
      logAssistantHeaderError("Optimization failed", e);
      setContent(replacement.restore());
      setOptimizeError(t("optimizeFailed"));
    } finally {
      if (isMountedRef.current && optimizeRunRef.current === runId) {
        setIsOptimizing(false);
      }
    }
  };

  if (!instruction && !isEditing) return null;

  return (
    <div className="bg-white/40 dark:bg-muted/40 backdrop-blur-md border border-gray-200 dark:border-border mb-4 md:mb-6 rounded-xl overflow-hidden shadow-sm">
      <div className="bg-white/30 dark:bg-muted/50 px-4 py-2 border-b border-gray-200 dark:border-border flex items-center justify-between">
        <div className="flex items-center gap-2 font-semibold text-gray-800 dark:text-foreground text-sm">
          <BotMessageSquare
            size={16}
            className="text-red-500"
            aria-hidden="true"
          />
          <span>{t("settingsTitle")}</span>

          {/* Optimize Button in Header */}
          <Tooltip content={t("optimizePrompt")} position="right">
            <button
              type="button"
              aria-label={t("optimizePrompt")}
              aria-busy={isOptimizing}
              onClick={handleOptimize}
              disabled={isOptimizing}
              className={`p-1 text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors disabled:opacity-50 ml-1 ${iconButtonFocusClass}`}
            >
              {isOptimizing ? (
                <Loader2
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Sparkles size={14} aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        </div>

        {!isEditing ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label={t("editInstructions")}
              onClick={() => setIsEditing(true)}
              className={`p-1.5 hover:bg-white/50 dark:hover:bg-accent/50 rounded-lg text-gray-500 dark:text-muted-foreground transition-colors ${iconButtonFocusClass}`}
            >
              <PenLine size={14} aria-hidden="true" />
            </button>
            {onDelete && (
              <button
                type="button"
                aria-label={t("clearInstructions")}
                onClick={onDelete}
                className={`p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 dark:text-muted-foreground/70 dark:hover:text-red-400 rounded-lg transition-colors ${iconButtonFocusClass}`}
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-1">
            <button
              type="button"
              aria-label={t("cancelEditing")}
              onClick={() => setIsEditing(false)}
              className={`p-1 hover:bg-white/50 dark:hover:bg-accent/50 rounded-lg text-gray-500 dark:text-muted-foreground transition-colors ${iconButtonFocusClass}`}
            >
              <X size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("saveInstructions")}
              onClick={handleSave}
              className={`p-1 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg transition-colors ${iconButtonFocusClass}`}
            >
              <Save size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className="p-4 bg-white/20 dark:bg-card/20 relative">
        {isOptimizing && (
          <div
            className="absolute inset-0 bg-white/50 dark:bg-card/50 backdrop-blur-[1px] z-10 flex items-center justify-center"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400 bg-white dark:bg-muted px-3 py-1.5 rounded-full shadow-sm border border-blue-100 dark:border-blue-900">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />{" "}
              {t("optimizing")}
            </div>
          </div>
        )}
        {optimizeError && (
          <div
            id={optimizeErrorId}
            role="status"
            aria-live="polite"
            className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
          >
            {optimizeError}
          </div>
        )}

        {isEditing ? (
          <div className="space-y-2">
            <label htmlFor={textareaId} className="sr-only">
              {t("systemInstructionsLabel")}
            </label>
            <textarea
              id={textareaId}
              name="assistant-system-instructions"
              ref={textareaRef}
              value={content}
              autoComplete="off"
              aria-describedby={optimizeError ? optimizeErrorId : undefined}
              aria-busy={isOptimizing}
              onChange={(e) => {
                setContent(e.target.value);
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              className="max-h-[15vh] w-full text-sm text-gray-800 dark:text-foreground focus:outline-0 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-400/40 resize-none bg-transparent"
              placeholder={t("instructionsPlaceholder")}
              rows={3}
            />
          </div>
        ) : (
          <div className="max-h-[15vh] overflow-y-auto custom-scrollbar px-1">
            <MarkdownRenderer
              content={instruction}
              className="text-sm text-gray-700 dark:text-foreground/85 leading-relaxed"
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default AssistantHeader;
