"use client";
import React, { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ToolCall } from "@/types";
import {
  ChevronDown,
  LoaderCircle,
  Wrench,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Blocks } from "lucide-react";
import {
  formatToolDisplayName,
  formatToolDisplayValue,
} from "@/lib/utils/toolDisplay";

interface ToolCallBlockProps {
  toolCalls: ToolCall[];
}

const EMPTY_TOOL_CALLS: ToolCall[] = [];

const ToolCallBlock: React.FC<ToolCallBlockProps> = ({ toolCalls }) => {
  const t = useTranslations("Content");
  const [isExpanded, setIsExpanded] = useState(false);
  const panelId = useId();
  const safeToolCalls = toolCalls || EMPTY_TOOL_CALLS;

  const displayToolCalls = useMemo(
    () =>
      safeToolCalls.map((toolCall) => ({
        ...toolCall,
        displayName: formatToolDisplayName(toolCall.name),
        argsDisplay: formatToolDisplayValue(toolCall.args),
        resultDisplay:
          toolCall.result !== undefined
            ? formatToolDisplayValue(toolCall.result)
            : null,
      })),
    [safeToolCalls],
  );

  if (safeToolCalls.length === 0) return null;

  const activeTool = safeToolCalls.find(
    (tc) => tc.status === "pending" || tc.status === "running",
  );
  const activeDisplayTool = displayToolCalls.find(
    (tc) => tc.id === activeTool?.id,
  );
  const isLoading = !!activeTool;
  const isError = safeToolCalls.some(
    (tc) => tc.status === "error" || tc.status === "skipped" || tc.isError,
  );

  const displayTitle =
    isLoading && activeDisplayTool
      ? t("runningTool", { name: activeDisplayTool.displayName })
      : t("usedTools", { count: safeToolCalls.length });

  const TruncatedBadge = () => (
    <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
      {t("truncated")}
    </span>
  );

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-gray-200 bg-gray-50/50 transition-[border-color,background-color,box-shadow] duration-300 dark:border-border dark:bg-muted/30">
      <button
        type="button"
        aria-expanded={isExpanded}
        aria-controls={panelId}
        aria-busy={isLoading || undefined}
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-600 dark:text-muted-foreground hover:bg-gray-100/50 dark:hover:bg-accent/30 transition-colors cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50"
      >
        <div
          className={`p-1 rounded ${isLoading ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" : isError ? "bg-red-100 text-red-600" : "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"}`}
        >
          {isLoading ? (
            <LoaderCircle
              size={12}
              className="animate-spin"
              aria-hidden="true"
            />
          ) : (
            <Blocks size={12} aria-hidden="true" />
          )}
        </div>

        <span className="flex-1 text-left truncate">{displayTitle}</span>

        <ChevronDown
          size={14}
          className={`transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      <div
        id={panelId}
        role="region"
        aria-label={t("toolCallDetails")}
        className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <div className="px-3 py-2 border-t border-gray-200/50 dark:border-border bg-white/40 dark:bg-card/40 space-y-3">
            {displayToolCalls.map((tc) => (
              <div key={tc.id} className="text-xs">
                <div className="flex items-center justify-between mb-1.5 font-medium text-gray-700 dark:text-foreground/85">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Wrench
                      size={12}
                      className="text-gray-400"
                      aria-hidden="true"
                    />
                    <span className="truncate">{tc.displayName}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {tc.status === "pending" || tc.status === "running" ? (
                      <span
                        role="status"
                        aria-live="polite"
                        className="text-blue-500 flex items-center gap-1"
                      >
                        <LoaderCircle
                          size={10}
                          className="animate-spin"
                          aria-hidden="true"
                        />{" "}
                        {tc.status === "pending"
                          ? t("statusPending")
                          : t("statusRunning")}
                      </span>
                    ) : tc.status === "skipped" ? (
                      <span className="text-amber-500 flex items-center gap-1">
                        <AlertCircle size={10} aria-hidden="true" />{" "}
                        {t("statusSkipped")}
                      </span>
                    ) : tc.status === "error" || tc.isError ? (
                      <span className="text-red-500 flex items-center gap-1">
                        <AlertCircle size={10} aria-hidden="true" />{" "}
                        {t("statusError")}
                      </span>
                    ) : (
                      <span className="text-green-500 flex items-center gap-1">
                        <CheckCircle2 size={10} aria-hidden="true" />{" "}
                        {t("statusSuccess")}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mb-1 max-h-72 overflow-auto rounded bg-gray-100 p-2 font-mono text-gray-600 dark:bg-muted dark:text-foreground/85">
                  <span className="opacity-50 select-none">
                    {t("argsLabel")}
                  </span>
                  {tc.argsDisplay.truncated ? <TruncatedBadge /> : null}
                  <pre className="mt-1 whitespace-pre-wrap break-words">
                    {tc.argsDisplay.text}
                  </pre>
                </div>

                {tc.result !== undefined && (
                  <div
                    className={`max-h-72 overflow-auto rounded p-2 font-mono border-l-2 ${tc.isError ? "bg-red-50 dark:bg-red-900/10 border-red-500 text-red-600 dark:text-red-300" : "bg-green-50 dark:bg-green-900/10 border-green-500 text-gray-600 dark:text-foreground/85"}`}
                  >
                    <span className="opacity-50 select-none">
                      {t("resultLabel")}
                    </span>
                    {tc.resultDisplay?.truncated ? <TruncatedBadge /> : null}
                    <pre className="mt-1 whitespace-pre-wrap break-words">
                      {tc.resultDisplay?.text || ""}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToolCallBlock;
