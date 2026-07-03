"use client";
import React, { useMemo, useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import {
  Copy,
  Check,
  Terminal,
  FileText,
  Maximize2,
  Minimize2,
  ChevronDown,
  SquareCode,
  X,
  SquareTerminal,
  Loader2,
} from "lucide-react";
import { Source } from "@/types";
import { useUIStore } from "@/store/core/uiStore";
import { useSettingsStore } from "@/store/core/settingsStore";
import { useChatStore } from "@/store/core/chatStore";
import { useCoreSettingsStore } from "@/store/core/coreSettingsStore";
import { executeCode } from "@/services/api/chatService";
import { runInSandbox } from "@/utils/sandbox";
import { isOpenAIProviderType } from "@/lib/providers/providerTypes";
import { resolveOPFSUrl, isOPFSUrl } from "@/utils/opfs";
import {
  getSafeExternalHref,
  getSafeFaviconProxyUrl,
  getSafeMarkdownImageSrc,
  getSafeWebHref,
} from "@/lib/security/clientUrl";
import { createSandboxedHtmlPreviewSrcDoc } from "@/lib/utils/htmlPreview";
import {
  parseMarkdownFileBlocks,
  type MarkdownGeneratedFile,
} from "@/lib/utils/markdownFiles";
import {
  collectMarkdownImageGallery,
  getMarkdownImageGalleryIndex,
} from "@/lib/utils/markdownImages";
import { copyTextToClipboard } from "@/lib/utils/clipboard";
import { linkifyCitationReferences } from "@/lib/utils/citations";
import { resolveObjectUrlWithLifecycle } from "@/lib/utils/objectUrlLifecycle";
import { parseModelString } from "@/lib/utils/model";
import type { PreviewImageInput } from "@/lib/utils/imagePreview";
import Tooltip from "../ui/Tooltip";

import "katex/dist/katex.min.css";
import "highlight.js/styles/github-dark.min.css";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  searchSources?: Source[];
  onFileClick?: (file: MarkdownGeneratedFile) => void;
  isStreaming?: boolean;
}

const extractHtmlTitle = (html: string) => {
  const match = html.match(/<title>(.*?)<\/title>/i);
  return match ? match[1].trim() : "HTML Preview";
};

type TimeoutHandle = ReturnType<typeof setTimeout>;

function clearTimeoutRef(ref: React.MutableRefObject<TimeoutHandle | null>) {
  if (!ref.current) return;
  clearTimeout(ref.current);
  ref.current = null;
}

function clearFrameRef(ref: React.MutableRefObject<number | null>) {
  if (ref.current === null) return;
  cancelAnimationFrame(ref.current);
  ref.current = null;
}

const CitationHoverCard = ({
  source,
  position,
}: {
  source: Source;
  position: { x: number; y: number };
}) => {
  const safeSourceUrl = getSafeWebHref(source.url);
  const faviconUrl = getSafeFaviconProxyUrl(safeSourceUrl || undefined);

  return createPortal(
    <div
      className="fixed z-9999 pointer-events-none animate-in fade-in zoom-in-95 duration-200"
      style={{ left: position.x, top: position.y }}
    >
      <div className="bg-white dark:bg-muted rounded-xl shadow-xl border border-gray-200 dark:border-border p-3 flex flex-col gap-2 text-left w-64 transform -translate-x-1/2 -translate-y-full -mt-2">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-sm bg-gray-100 dark:bg-accent shrink-0 overflow-hidden">
            {faviconUrl && (
              <img
                src={faviconUrl}
                className="w-full h-full object-cover"
                alt=""
                width={16}
                height={16}
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={(e) =>
                  ((e.target as HTMLImageElement).style.opacity = "0")
                }
              />
            )}
          </div>
          <span className="font-semibold text-xs text-gray-800 dark:text-foreground truncate">
            {source.title}
          </span>
        </div>
        {safeSourceUrl && (
          <div className="text-[10px] text-gray-400 font-mono truncate">
            {safeSourceUrl}
          </div>
        )}
        {source.content && (
          <div className="text-[10px] text-gray-500 dark:text-muted-foreground line-clamp-3 leading-relaxed">
            {source.content}
          </div>
        )}
        {/* Arrow */}
        <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-white dark:border-t-popover drop-shadow-sm"></div>
      </div>
    </div>,
    document.body,
  );
};

const CitationLink = ({
  href,
  children,
  sources,
}: {
  href: string | undefined;
  children?: React.ReactNode;
  sources: Source[];
}) => {
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const ref = useRef<HTMLSpanElement>(null);
  const safeHref = getSafeExternalHref(href);

  if (!href || !href.includes("#citation-")) {
    if (!safeHref) {
      return (
        <span className="text-gray-600 dark:text-foreground/85 break-all">
          {children}
        </span>
      );
    }

    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400 hover:underline break-all"
      >
        {children}
      </a>
    );
  }

  const match = href.match(/#citation-(\d+)$/);
  const index = match ? parseInt(match[1], 10) : -1;
  const source = sources[index];

  if (!source) {
    // Fallback if source not found but format matches
    if (!safeHref) {
      return (
        <span className="text-blue-600 dark:text-blue-400">{children}</span>
      );
    }

    return (
      <a
        href={safeHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 dark:text-blue-400"
      >
        {children}
      </a>
    );
  }

  const handleMouseEnter = () => {
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setHoverPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
  };

  const safeSourceUrl = getSafeWebHref(source.url);

  return (
    <span
      ref={ref}
      className="relative inline-block align-top ml-0.5 select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setHoverPos(null)}
    >
      <a
        href={safeSourceUrl || undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!safeSourceUrl}
        onClick={(event) => {
          if (!safeSourceUrl) event.preventDefault();
        }}
        className={`inline-flex items-center justify-center min-w-4 h-4 px-0.5 text-[10px] font-bold text-gray-500 bg-gray-200 dark:text-foreground/85 dark:bg-accent rounded-full no-underline transition-colors transform -translate-y-0.5 ${
          safeSourceUrl
            ? "hover:bg-gray-300 dark:hover:bg-accent/80 cursor-pointer"
            : "cursor-default opacity-70"
        }`}
      >
        {children}
      </a>

      {/* Portal Hover Card */}
      {hoverPos && <CitationHoverCard source={source} position={hoverPos} />}
    </span>
  );
};

const FileCard = ({
  file,
  onClick,
}: {
  file: MarkdownGeneratedFile;
  onClick?: (file: MarkdownGeneratedFile) => void;
}) => {
  const t = useTranslations("Content");
  const { name, type, truncated, incomplete } = file;
  const isInteractive = Boolean(onClick);
  const cardBody = (
    <>
      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
        <FileText size={20} aria-hidden="true" />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-800 dark:text-foreground truncate">
          {name}
        </span>
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-muted-foreground">
          <span className="transition-colors group-hover:text-blue-500 dark:group-hover:text-blue-400">
            {isInteractive ? t("openGeneratedFile") : t("generatedFile")}
          </span>
          {type ? (
            <span className="max-w-40 truncate rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[10px] text-gray-500 dark:bg-accent dark:text-foreground/85">
              {type}
            </span>
          ) : null}
          {truncated ? (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-200">
              {t("truncated")}
            </span>
          ) : null}
          {incomplete ? (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-accent dark:text-foreground/85">
              {t("incomplete")}
            </span>
          ) : null}
        </div>
      </div>
    </>
  );

  const className =
    "group my-2 inline-flex min-w-50 w-full select-none items-center gap-3 rounded-xl border border-gray-200 bg-white/50 p-3 text-left shadow-sm transition-[border-color,background-color,box-shadow] dark:border-border dark:bg-muted/50 md:w-auto";

  if (!onClick) {
    return (
      <div
        aria-label={t("generatedFileAria", { name })}
        className={`${className} cursor-default`}
      >
        {cardBody}
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label={t("openGeneratedFileAria", { name })}
      onClick={() => onClick(file)}
      className={`${className} cursor-pointer hover:border-blue-200 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:hover:border-blue-800 dark:hover:bg-blue-900/10`}
    >
      {cardBody}
    </button>
  );
};

const ArtifactBlock = ({
  language,
  rawCode,
  children,
  isStreaming,
}: {
  language: string;
  rawCode: string;
  children: React.ReactNode;
  isStreaming?: boolean;
}) => {
  const t = useTranslations("Content");
  const [copyStatus, setCopyStatus] = React.useState<
    "idle" | "copied" | "error"
  >("idle");
  const copied = copyStatus === "copied";
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const [canCollapse, setCanCollapse] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = React.useState(false);

  // Execution State
  const [isExecuting, setIsExecuting] = React.useState(false);
  const [consoleOutput, setConsoleOutput] = React.useState<string | null>(null);
  const [executionNotice, setExecutionNotice] = React.useState<string | null>(
    null,
  );

  // Use state for maxHeight to avoid render-loop flickering with 'auto'/'none'
  const [maxHeight, setMaxHeight] = React.useState<string>("none");

  const contentRef = React.useRef<HTMLDivElement>(null);
  const consoleRef = React.useRef<HTMLDivElement>(null);
  const fullscreenDialogRef = React.useRef<HTMLDivElement>(null);
  const previewDialogRef = React.useRef<HTMLDivElement>(null);
  const previewCloseButtonRef = React.useRef<HTMLButtonElement>(null);
  const previousDialogFocusRef = React.useRef<HTMLElement | null>(null);
  const hasCheckedHeight = React.useRef(false);
  const isMountedRef = React.useRef(true);
  const copyResetTimerRef = React.useRef<TimeoutHandle | null>(null);
  const scrollTimerRef = React.useRef<TimeoutHandle | null>(null);
  const collapseTimerRef = React.useRef<TimeoutHandle | null>(null);
  const collapseFrameRef = React.useRef<number | null>(null);

  const { system } = useSettingsStore();
  const { selectedModel } = useChatStore();
  const { providers } = useCoreSettingsStore();
  const artifactId = React.useId();
  const codeContentId = `${artifactId}-code-content`;
  const consoleOutputId = `${artifactId}-console-output`;
  const fullscreenTitleId = `${artifactId}-fullscreen-title`;
  const previewTitleId = `${artifactId}-preview-title`;

  const shouldAutoCollapse = system.enableCodeCollapse ?? true;
  const isHtml =
    language?.toLowerCase() === "html" || language?.toLowerCase() === "xml";
  const isPython =
    language?.toLowerCase() === "python" || language?.toLowerCase() === "py";
  const isJS = ["javascript", "js"].includes(language?.toLowerCase());
  const previewSrcDoc = React.useMemo(
    () => (isHtml ? createSandboxedHtmlPreviewSrcDoc(rawCode) : ""),
    [isHtml, rawCode],
  );
  const previewTitle = React.useMemo(
    () => extractHtmlTitle(rawCode),
    [rawCode],
  );
  const selectedProvider = React.useMemo(() => {
    const { providerId } = parseModelString(selectedModel);
    return providerId
      ? providers.find((provider) => provider.id === providerId)
      : providers.find((provider) => provider.enabled);
  }, [providers, selectedModel]);
  const executionModeLabel = React.useMemo(() => {
    if (isJS) return t("jsSandboxExecution");
    if (!isPython) return t("codeExecution");
    if (isOpenAIProviderType(selectedProvider?.type)) {
      return t("pythonSimulation");
    }
    if (selectedProvider?.type === "Gemini") return t("geminiCodeExecution");
    return t("modelCodeExecution");
  }, [isJS, isPython, selectedProvider?.type, t]);
  const executionNoticeText = React.useMemo(() => {
    if (isJS) return t("jsSandboxNotice");
    if (!isPython) return null;
    if (isOpenAIProviderType(selectedProvider?.type)) {
      return t("pythonSimulationNotice");
    }
    if (selectedProvider?.type === "Gemini") {
      return t("geminiCodeExecutionNotice");
    }
    return t("modelCodeExecutionNotice");
  }, [isJS, isPython, selectedProvider?.type, t]);

  React.useEffect(() => {
    return () => {
      isMountedRef.current = false;
      clearTimeoutRef(copyResetTimerRef);
      clearTimeoutRef(scrollTimerRef);
      clearTimeoutRef(collapseTimerRef);
      clearFrameRef(collapseFrameRef);
    };
  }, []);

  const scheduleCopyReset = () => {
    clearTimeoutRef(copyResetTimerRef);
    copyResetTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        setCopyStatus("idle");
      }
      copyResetTimerRef.current = null;
    }, 2000);
  };

  const scheduleConsoleScroll = () => {
    clearTimeoutRef(scrollTimerRef);
    scrollTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        consoleRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      scrollTimerRef.current = null;
    }, 100);
  };

  const handleDialogKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
    dialogRef: React.RefObject<HTMLDivElement | null>,
    onClose: () => void,
  ) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), iframe, [href], input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.getClientRects().length > 0);

    if (focusableElements.length === 0) {
      event.preventDefault();
      dialog.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  };

  const clearCollapseSchedule = () => {
    clearTimeoutRef(collapseTimerRef);
    clearFrameRef(collapseFrameRef);
  };

  const handleCopy = async () => {
    const didCopy = await copyTextToClipboard(String(rawCode));
    if (!isMountedRef.current) return;
    setCopyStatus(didCopy ? "copied" : "error");
    scheduleCopyReset();
  };

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  const handleExecute = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    setConsoleOutput(null); // Reset output
    setExecutionNotice(executionNoticeText);

    try {
      // If the block is collapsed, expand it to show the console at bottom
      if (isCollapsed) {
        toggleCollapse();
      }

      let output = "";
      if (isPython) {
        output = await executeCode(selectedModel, rawCode);
      } else if (isJS) {
        output = await runInSandbox(rawCode);
      }
      if (!isMountedRef.current) return;
      setConsoleOutput(output);
      scheduleConsoleScroll();
    } catch (e) {
      if (!isMountedRef.current) return;
      setConsoleOutput(`Error: ${e instanceof Error ? e.message : String(e)}`);
      scheduleConsoleScroll();
    } finally {
      if (isMountedRef.current) {
        setIsExecuting(false);
      }
    }
  };

  const toggleCollapse = () => {
    clearCollapseSchedule();

    if (isCollapsed) {
      // EXPAND
      if (contentRef.current) {
        // 1. Set specific height for transition start
        setMaxHeight(`${contentRef.current.scrollHeight}px`);
        setIsCollapsed(false);

        // 2. Allow transition to finish, then remove constraint
        collapseTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            setMaxHeight("none");
          }
          collapseTimerRef.current = null;
        }, 500);
      }
    } else {
      // COLLAPSE
      if (contentRef.current) {
        // 1. Set current height explicitly to enable transition
        setMaxHeight(`${contentRef.current.scrollHeight}px`);
        setIsCollapsed(true);

        // 2. Next tick, set to target height
        collapseFrameRef.current = requestAnimationFrame(() => {
          collapseFrameRef.current = null;
          collapseTimerRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              setMaxHeight("50vh");
            }
            collapseTimerRef.current = null;
          }, 10);
        });
      }
    }
  };

  React.useEffect(() => {
    if (!isFullscreen && !isPreviewOpen) return;

    previousDialogFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    if (isPreviewOpen) {
      previewCloseButtonRef.current?.focus({ preventScroll: true });
    } else if (isFullscreen) {
      fullscreenDialogRef.current?.focus({ preventScroll: true });
    }

    return () => {
      if (previousDialogFocusRef.current?.isConnected) {
        previousDialogFocusRef.current.focus({ preventScroll: true });
      }
      previousDialogFocusRef.current = null;
    };
  }, [isFullscreen, isPreviewOpen]);

  // Initial Check & Streaming Updates
  useEffect(() => {
    if (isStreaming) return; // Do not calculate during streaming

    if (contentRef.current) {
      const height = contentRef.current.scrollHeight;
      const vh50 = window.innerHeight * 0.5;

      // Only run the auto-collapse logic ONCE per block instance after streaming is done
      if (!hasCheckedHeight.current) {
        if (height > vh50) {
          setCanCollapse(true);
          if (shouldAutoCollapse) {
            setIsCollapsed(true);
            setMaxHeight("50vh");
          }
        }
        hasCheckedHeight.current = true;
      } else {
        // Update collapse eligibility if content grows significantly later (e.g. edit)
        if (height > vh50 && !canCollapse) {
          setCanCollapse(true);
        }
      }
    }
  }, [rawCode, canCollapse, isStreaming, shouldAutoCollapse]);

  // Common Header Logic
  const Header = ({ isFullscreenMode = false }) => (
    <div className="flex items-center justify-between pl-4 pr-2 py-1 bg-gray-100/50 dark:bg-card/50 border-b border-gray-200 dark:border-border select-none transition-colors">
      {/* Left Side: Language */}
      <div className="flex items-center gap-3">
        <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-muted-foreground uppercase font-semibold">
          <Terminal size={14} aria-hidden="true" />
          <span>{language || "code"}</span>
        </div>
      </div>

      {/* Right Side: Fullscreen + Copy + Collapse */}
      <div className="flex items-center gap-2">
        {/* Preview Toggle for HTML */}
        {isHtml && !isFullscreenMode && (
          <Tooltip content={t("preview")} position="bottom">
            <button
              type="button"
              onClick={() => setIsPreviewOpen(true)}
              aria-label={t("previewHtml")}
              className="flex items-center justify-center p-1.5 text-gray-500 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground transition-colors rounded hover:bg-gray-200 dark:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              <SquareCode size={14} aria-hidden="true" />
            </button>
          </Tooltip>
        )}

        {/* Run Button for Python OR JS */}
        {(isPython || isJS) && !isFullscreenMode && (
          <Tooltip
            content={t("runCodeWithMode", { mode: executionModeLabel })}
            position="bottom"
          >
            <button
              type="button"
              onClick={handleExecute}
              disabled={isExecuting}
              aria-busy={isExecuting}
              aria-describedby={
                consoleOutput !== null || isExecuting
                  ? consoleOutputId
                  : undefined
              }
              aria-label={isExecuting ? t("runningCodeAria") : t("runCodeAria")}
              className={`flex items-center justify-center p-1.5 transition-colors rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${isExecuting ? "text-blue-500 bg-blue-50 dark:bg-blue-900/20" : "text-gray-500 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground hover:bg-gray-200 dark:hover:bg-accent"}`}
            >
              {isExecuting ? (
                <Loader2
                  size={14}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <SquareTerminal size={14} aria-hidden="true" />
              )}
            </button>
          </Tooltip>
        )}

        {/* Fullscreen Toggle */}
        <Tooltip
          content={isFullscreenMode ? t("exitFullscreen") : t("fullscreen")}
          position="bottom"
        >
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={
              isFullscreenMode ? t("exitFullscreenAria") : t("fullscreenAria")
            }
            aria-pressed={isFullscreen}
            className="flex items-center justify-center p-1.5 text-gray-500 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground transition-colors rounded hover:bg-gray-200 dark:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            {isFullscreenMode ? (
              <Minimize2 size={14} aria-hidden="true" />
            ) : (
              <Maximize2 size={14} aria-hidden="true" />
            )}
          </button>
        </Tooltip>

        {/* Copy Button */}
        <Tooltip
          content={
            copied
              ? t("copied")
              : copyStatus === "error"
                ? t("copyFailed")
                : t("copyCode")
          }
          position="bottom"
        >
          <button
            type="button"
            onClick={handleCopy}
            aria-label={
              copied
                ? t("codeCopiedAria")
                : copyStatus === "error"
                  ? t("copyFailed")
                  : t("copyCodeAria")
            }
            className="flex items-center justify-center p-1.5 text-gray-500 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground transition-colors rounded hover:bg-gray-200 dark:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            {copied ? (
              <Check
                size={14}
                className="text-green-600 dark:text-green-400"
                aria-hidden="true"
              />
            ) : copyStatus === "error" ? (
              <X
                size={14}
                className="text-red-500 dark:text-red-400"
                aria-hidden="true"
              />
            ) : (
              <Copy size={14} aria-hidden="true" />
            )}
            <span className="sr-only" aria-live="polite">
              {copied
                ? t("codeCopiedAria")
                : copyStatus === "error"
                  ? t("copyFailed")
                  : t("copyCodeAria")}
            </span>
          </button>
        </Tooltip>

        {/* Expand/Collapse */}
        {!isFullscreenMode && canCollapse && (
          <Tooltip
            content={isCollapsed ? t("expand") : t("collapse")}
            position="bottom"
          >
            <button
              type="button"
              onClick={toggleCollapse}
              aria-controls={codeContentId}
              aria-expanded={!isCollapsed}
              aria-label={
                isCollapsed ? t("expandCodeAria") : t("collapseCodeAria")
              }
              className="flex items-center justify-center p-1.5 text-gray-500 hover:text-gray-700 dark:text-muted-foreground dark:hover:text-foreground transition-colors rounded hover:bg-gray-200 dark:hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              <ChevronDown
                size={14}
                className={`transition-transform duration-300 ${!isCollapsed ? "rotate-180" : ""}`}
                aria-hidden="true"
              />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );

  // Fullscreen Portal
  const fullscreenView = isFullscreen
    ? createPortal(
        <div
          ref={fullscreenDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={fullscreenTitleId}
          tabIndex={-1}
          onKeyDown={(event) =>
            handleDialogKeyDown(event, fullscreenDialogRef, () =>
              setIsFullscreen(false),
            )
          }
          className="fixed inset-0 z-1000 bg-white dark:bg-background flex flex-col animate-in fade-in duration-200"
        >
          <h2 id={fullscreenTitleId} className="sr-only">
            {t("fullscreenCodeView")}
          </h2>
          <div className="container mx-auto h-full flex flex-col p-4">
            <div className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-muted/80 shadow-sm w-full h-full flex flex-col overflow-hidden">
              <Header isFullscreenMode={true} />
              <div className="flex-1 overflow-auto p-4 text-gray-800 dark:text-foreground text-sm font-mono leading-relaxed custom-scrollbar">
                <pre>{children}</pre>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  // HTML Preview Portal
  const previewView = isPreviewOpen
    ? createPortal(
        <div
          ref={previewDialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={previewTitleId}
          tabIndex={-1}
          onKeyDown={(event) =>
            handleDialogKeyDown(event, previewDialogRef, () =>
              setIsPreviewOpen(false),
            )
          }
          className="fixed inset-0 z-2000 bg-white dark:bg-background flex flex-col animate-in fade-in duration-200"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-border bg-white dark:bg-card">
            <h2
              id={previewTitleId}
              className="flex min-w-0 items-center gap-2 font-semibold text-gray-800 dark:text-foreground"
            >
              <SquareCode
                size={18}
                className="shrink-0 text-blue-500"
                aria-hidden="true"
              />
              <span className="font-semibold text-gray-800 dark:text-foreground">
                {previewTitle}
              </span>
            </h2>
            <button
              ref={previewCloseButtonRef}
              type="button"
              onClick={() => setIsPreviewOpen(false)}
              aria-label={t("closePreview")}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-muted rounded-lg text-gray-500 dark:text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 bg-white relative">
            <iframe
              srcDoc={previewSrcDoc}
              className="w-full h-full border-none"
              sandbox=""
              referrerPolicy="no-referrer"
              title={t("previewTitleSuffix", { title: previewTitle })}
            />
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div className="group/codeblock my-4">
        <div className="rounded-lg border border-gray-200 dark:border-border bg-white dark:bg-muted/80 shadow-sm w-full transition-[border-color,background-color,box-shadow] duration-300 flex flex-col overflow-hidden">
          <Header />
          <div
            id={codeContentId}
            ref={contentRef}
            className={`
                        w-full overflow-x-auto text-gray-800 dark:text-foreground text-sm font-mono leading-relaxed
                        transition-[max-height] duration-500 ease-in-out relative
                        ${isCollapsed ? "overflow-y-hidden" : ""}
                    `}
            style={{ maxHeight: maxHeight }}
          >
            <div className="p-4 min-w-0">
              <pre>{children}</pre>
              {/* Gradient Overlay */}
              {canCollapse && (
                <div
                  className={`absolute w-full bottom-0 left-0 h-16 bg-linear-to-t from-white dark:from-card to-transparent pointer-events-none transition-opacity duration-500 ${isCollapsed ? "opacity-100" : "opacity-0"}`}
                  aria-hidden="true"
                />
              )}
            </div>
          </div>

          {/* Console Panel */}
          {(consoleOutput !== null || isExecuting) && (
            <div
              ref={consoleRef}
              id={consoleOutputId}
              role="status"
              aria-live="polite"
              className="border-t border-gray-200 dark:border-border bg-gray-800 dark:bg-background p-3 font-mono text-xs overflow-x-auto"
            >
              <div className="flex items-center gap-2 mb-2 text-gray-400 font-bold uppercase tracking-wider select-none">
                <SquareTerminal size={12} aria-hidden="true" />
                <span>{t("consoleOutput")}</span>
                <span className="normal-case tracking-normal text-gray-500">
                  {executionModeLabel}
                </span>
                {isExecuting && (
                  <Loader2
                    size={10}
                    className="animate-spin ml-1"
                    aria-hidden="true"
                  />
                )}
              </div>
              {executionNotice && (
                <div className="mb-2 rounded border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[11px] font-sans text-amber-200">
                  {executionNotice}
                </div>
              )}
              <pre
                className={`whitespace-pre-wrap break-all ${consoleOutput?.startsWith("Error:") ? "text-red-400" : "text-green-400"}`}
              >
                {consoleOutput || (isExecuting ? t("executing") : "")}
              </pre>
            </div>
          )}
        </div>
      </div>
      {fullscreenView}
      {previewView}
    </>
  );
};

const MarkdownImage = ({
  src,
  alt,
  gallery = [],
  ...props
}: any & { gallery?: PreviewImageInput[] }) => {
  const t = useTranslations("Content");
  const { openImagePreview } = useUIStore();
  const safeSrc = getSafeMarkdownImageSrc(src);
  const [resolvedOpfsSrc, setResolvedOpfsSrc] = useState<{
    source: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!safeSrc || !isOPFSUrl(safeSrc)) return;

    const resolution = resolveObjectUrlWithLifecycle({
      source: safeSrc,
      resolveObjectUrl: resolveOPFSUrl,
      onResolved: (url) => {
        setResolvedOpfsSrc(url ? { source: safeSrc, url } : null);
      },
      onError: () => setResolvedOpfsSrc(null),
    });

    return () => resolution.cancel();
  }, [safeSrc]);

  const resolvedSrc =
    safeSrc && isOPFSUrl(safeSrc)
      ? resolvedOpfsSrc?.source === safeSrc
        ? resolvedOpfsSrc.url
        : null
      : safeSrc;
  const previewSrc = safeSrc && isOPFSUrl(safeSrc) ? safeSrc : resolvedSrc;

  if (!resolvedSrc) {
    return (
      <span className="my-2 block rounded-lg border border-dashed border-gray-300 dark:border-border px-3 py-2 text-xs text-gray-500 dark:text-muted-foreground">
        {t("imageBlocked")}
      </span>
    );
  }

  const image = (
    <img
      className="block max-h-[50vh] max-w-full rounded-lg border-gray-200 object-contain dark:border-border"
      src={resolvedSrc}
      alt={alt || ""}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      {...props}
    />
  );

  if (!previewSrc) {
    return <span className="my-2 mx-auto block max-w-full">{image}</span>;
  }

  return (
    <button
      type="button"
      aria-label={alt ? t("previewImageWithAlt", { alt }) : t("previewImage")}
      className="my-2 mx-auto block max-w-full cursor-zoom-in rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background"
      onClick={() => {
        openImagePreview(
          gallery.length > 0
            ? gallery
            : [{ url: previewSrc, alt, description: alt }],
          getMarkdownImageGalleryIndex(gallery, previewSrc),
        );
      }}
    >
      {image}
    </button>
  );
};

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({
  content,
  className,
  searchSources,
  onFileClick,
  isStreaming,
}) => {
  // If className is provided, we assume the caller handles text color, otherwise default to gray.
  const defaultTextColors = "text-gray-800 dark:text-foreground";
  const finalClass = className ? className : defaultTextColors;
  const imageGallery = useMemo(
    () => collectMarkdownImageGallery(content),
    [content],
  );

  // Define components for ReactMarkdown
  const markdownComponents: any = useMemo(
    () => ({
      code({ node, className = "", children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || "");
        const language = match ? match[1] : "";

        // Extract raw text for copy functionality
        const getRawText = (node: any): string => {
          if (!node) return "";
          if (node.type === "text") return node.value;
          if (node.children) return node.children.map(getRawText).join("");
          return "";
        };
        const rawCode = getRawText(node);

        if (match) {
          return (
            <ArtifactBlock
              language={language}
              rawCode={rawCode}
              isStreaming={isStreaming}
            >
              {children}
            </ArtifactBlock>
          );
        }

        return (
          <code
            className={`${className} bg-gray-100 dark:bg-muted text-red-500 dark:text-red-400 rounded px-1 py-0.5 text-sm break-all font-mono`}
            {...props}
          >
            {children}
          </code>
        );
      },
      a: ({ href, children }: any) => {
        return (
          <CitationLink href={href} sources={searchSources || []}>
            {children}
          </CitationLink>
        );
      },
      p: ({ ...props }: any) => (
        <p className="mb-2 last:mb-0 leading-6" {...props} />
      ),
      img: (props: any) => <MarkdownImage {...props} gallery={imageGallery} />,
      blockquote: ({ ...props }: any) => (
        <blockquote
          className="border-l-4 border-gray-300 dark:border-input pl-4 italic text-gray-500 dark:text-muted-foreground my-4"
          {...props}
        />
      ),
      table: ({ ...props }: any) => (
        <div className="overflow-x-auto my-4 w-full block">
          <table
            className="min-w-full divide-y divide-gray-200 dark:divide-border border dark:border-border"
            {...props}
          />
        </div>
      ),
      th: ({ ...props }: any) => (
        <th
          className="bg-gray-50 dark:bg-muted px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-muted-foreground uppercase tracking-wider border-b dark:border-border whitespace-nowrap"
          {...props}
        />
      ),
      td: ({ ...props }: any) => (
        <td
          className="px-3 py-2 text-sm text-gray-600 dark:text-foreground/85 border-b dark:border-border min-w-20"
          {...props}
        />
      ),
    }),
    [imageGallery, searchSources, isStreaming],
  );

  // Process content line by line for <file> tags
  const renderContent = useMemo(() => {
    // 1. Handle Citations Globally First
    const textWithCitations = linkifyCitationReferences(content, searchSources);

    // 2. Split bounded model-generated file blocks from normal Markdown.
    return parseMarkdownFileBlocks(textWithCitations).map((segment, index) => {
      if (segment.kind === "markdown") {
        return (
          <ReactMarkdown
            key={`md-chunk-${index}`}
            remarkPlugins={[remarkGfm, remarkMath]}
            rehypePlugins={[rehypeKatex, rehypeHighlight]}
            components={markdownComponents}
          >
            {segment.content}
          </ReactMarkdown>
        );
      }

      return (
        <div key={`file-card-${index}`} className="block my-2">
          <FileCard file={segment.file} onClick={onFileClick} />
        </div>
      );
    });
  }, [content, searchSources, onFileClick, markdownComponents]);

  return (
    <div
      className={`markdown-body text-(length:--neo-font-size-base) leading-relaxed wrap-break-word w-full overflow-hidden ${finalClass}`}
    >
      {renderContent}
    </div>
  );
};

export default MarkdownRenderer;
