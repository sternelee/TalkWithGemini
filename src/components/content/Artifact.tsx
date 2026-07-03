import React, { useState, useRef, useEffect, useId } from "react";
import { useTranslations } from "next-intl";
import { v7 as uuidv7 } from "uuid";
import {
  Check,
  History,
  Clock,
  X,
  Loader2,
  BookOpen,
  GraduationCap,
  School,
  PersonStanding,
  Baby,
  Swords,
  AlignLeft,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
  Languages,
  ScrollText,
  SmilePlus,
} from "lucide-react";
import { streamGenerateContent } from "@/services/api/chatService";
import * as ArtifactService from "@/services/artifactService";
import Tooltip from "../ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Version {
  id: string;
  content: string;
  timestamp: number;
}

interface ArtifactProps {
  initialContent: string;
  initialTimestamp: number;
  onSave: (content: string) => void;
  onCancel: () => void;
  systemInstruction?: string;
  model: string;
}

const artifactFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background";

const artifactTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

const withHiddenIcon = (icon: React.ReactNode) =>
  React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<Record<string, unknown>>, {
        "aria-hidden": true,
        focusable: "false",
      })
    : icon;

const Artifact: React.FC<ArtifactProps> = ({
  initialContent,
  initialTimestamp,
  onSave,
  onCancel,
  systemInstruction = "",
  model,
}) => {
  const t = useTranslations("Content");
  const [content, setContent] = useState(initialContent);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingDuration, setProcessingDuration] = useState(0);
  const [activeDropdown, setActiveDropdown] = useState<
    "level" | "length" | "translate" | null
  >(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [versions, setVersions] = useState<Version[]>([
    {
      id: uuidv7(),
      content: initialContent,
      timestamp: initialTimestamp,
    },
  ]);
  const [showHistory, setShowHistory] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const actionRunIdRef = useRef(0);
  const isMountedRef = useRef(true);
  const hasFocusedEditorRef = useRef(false);
  const editorId = useId();
  const processingErrorId = useId();
  const historyPanelId = useId();

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      actionRunIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setActiveDropdown(null);
      setShowHistory(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        textareaRef.current.scrollHeight + "px";
    }
  }, [content]);

  useEffect(() => {
    if (!hasFocusedEditorRef.current && textareaRef.current) {
      hasFocusedEditorRef.current = true;
      textareaRef.current.focus();
    }
  }, []);

  // Processing Timer
  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      setProcessingDuration(0);
      interval = setInterval(() => {
        setProcessingDuration((prev) => prev + 0.1);
      }, 100);
    } else {
      setProcessingDuration(0);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

  // --- Logic ---

  const executeArtifactAction = async (
    prompt: string,
    isContinuation: boolean = false,
  ) => {
    if (isProcessing) return;

    const originalContent = content;
    const runId = actionRunIdRef.current + 1;
    actionRunIdRef.current = runId;

    setIsProcessing(true);
    setProcessingError(null);
    setActiveDropdown(null);

    if (!isContinuation) {
      setContent("");
    }

    let accumulatedNewText = "";

    try {
      await streamGenerateContent(model, prompt, (text) => {
        if (!isMountedRef.current || actionRunIdRef.current !== runId) return;
        accumulatedNewText += text;
        setContent((prev) => prev + text);
      });

      if (!isMountedRef.current || actionRunIdRef.current !== runId) return;

      const finalContent = isContinuation
        ? originalContent + accumulatedNewText
        : accumulatedNewText;
      const newVersion: Version = {
        id: uuidv7(),
        content: finalContent,
        timestamp: Date.now(),
      };

      setVersions((prev) => [newVersion, ...prev]);
    } catch (error) {
      if (isMountedRef.current && actionRunIdRef.current === runId) {
        setContent(originalContent);
        setProcessingError(
          error instanceof Error
            ? t("artifactUpdateFailedWithError", { error: error.message })
            : t("artifactUpdateFailed"),
        );
      }
    } finally {
      if (isMountedRef.current && actionRunIdRef.current === runId) {
        setIsProcessing(false);
      }
    }
  };

  const handleLevelChange = (level: string) => {
    const prompt = ArtifactService.changeReadingLevel(
      content,
      level,
      systemInstruction,
    );
    executeArtifactAction(prompt);
  };

  const handleLengthChange = (lengthDesc: string) => {
    const prompt = ArtifactService.changeArtifactLength(
      content,
      lengthDesc,
      systemInstruction,
    );
    executeArtifactAction(prompt);
  };

  const handleTranslate = (lang: string) => {
    const prompt = ArtifactService.changeArtifactLanguage(
      content,
      lang,
      systemInstruction,
    );
    executeArtifactAction(prompt);
  };

  const handleContinue = () => {
    const prompt = ArtifactService.continuation(content, systemInstruction);
    executeArtifactAction(prompt, true);
  };

  const handleEmoji = () => {
    const prompt = ArtifactService.addEmojis(content, systemInstruction);
    executeArtifactAction(prompt);
  };

  const restoreVersion = (version: Version) => {
    setProcessingError(null);
    setContent(version.content);
  };

  return (
    <div className="bg-white/80 dark:bg-muted/80 backdrop-blur-xl rounded-xl shadow-lg ring-2 ring-red-100/50 dark:ring-red-900/30 relative flex flex-col">
      {/* Content Area - Rounded Top, Hidden Overflow for overlays */}
      <div className="relative overflow-hidden rounded-t-xl min-h-[100px]">
        {/* Loading Overlay */}
        {isProcessing && (
          <div
            className="absolute inset-0 z-20 bg-white/50 dark:bg-card/50 backdrop-blur-[2px] flex flex-col items-center justify-center cursor-wait animate-in fade-in duration-300"
            role="status"
            aria-live="polite"
          >
            <div className="bg-white dark:bg-muted p-3 rounded-2xl shadow-xl border border-gray-200 dark:border-border flex flex-col items-center gap-2">
              <Loader2
                size={24}
                className="animate-spin text-red-500"
                aria-hidden="true"
              />
              <div className="flex flex-col items-center">
                <span className="text-xs font-medium text-gray-700 dark:text-foreground">
                  {t("generating")}
                </span>
                <span className="text-[10px] text-gray-500 dark:text-muted-foreground font-mono">
                  {processingDuration.toFixed(1)}s
                </span>
              </div>
            </div>
          </div>
        )}

        {/* History Sidebar */}
        {showHistory && (
          <aside
            id={historyPanelId}
            aria-label={t("versionHistoryAria")}
            className="absolute top-0 bottom-0 right-0 w-64 bg-white/90 dark:bg-popover/90 backdrop-blur-xl border-l border-white/40 dark:border-border z-30 flex flex-col animate-in slide-in-from-right duration-300 shadow-2xl"
          >
            <div className="p-3 border-b border-gray-200/50 dark:border-border flex justify-between items-center bg-white/40 dark:bg-muted/40">
              <span className="font-semibold text-xs text-gray-700 dark:text-foreground flex items-center gap-1.5">
                <History
                  size={12}
                  className="text-blue-500"
                  aria-hidden="true"
                />{" "}
                {t("versionHistory")}
              </span>
              <button
                type="button"
                aria-label={t("closeVersionHistory")}
                onClick={() => setShowHistory(false)}
                className={`p-1 hover:bg-black/5 dark:hover:bg-accent rounded-full transition-colors ${artifactFocusClass}`}
              >
                <X size={14} className="text-gray-500" aria-hidden="true" />
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar"
              role="list"
            >
              {versions.map((v, i) => (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => restoreVersion(v)}
                  aria-pressed={content === v.content}
                  aria-label={t("restoreVersionAria", {
                    time: artifactTimeFormatter.format(new Date(v.timestamp)),
                  })}
                  className={`block w-full text-left p-2.5 rounded-lg border transition-[background-color,border-color,color] group ${artifactFocusClass} ${
                    content === v.content
                      ? "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                      : "bg-white/50 dark:bg-muted/50 border-transparent hover:border-gray-200 dark:hover:border-border hover:bg-white dark:hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-muted-foreground font-medium">
                      <Clock size={10} aria-hidden="true" />
                      <span>
                        {artifactTimeFormatter.format(new Date(v.timestamp))}
                      </span>
                    </div>
                    {i === versions.length - 1 && (
                      <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-accent text-gray-500 dark:text-muted-foreground text-[9px] rounded-full uppercase tracking-wider font-bold">
                        {t("orig")}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-700 dark:text-foreground/85 line-clamp-4 leading-relaxed font-mono opacity-90 break-all">
                    {v.content}
                  </div>
                </button>
              ))}
            </div>
          </aside>
        )}

        <label htmlFor={editorId} className="sr-only">
          {t("artifactContent")}
        </label>
        <textarea
          id={editorId}
          name="artifact-content"
          ref={textareaRef}
          value={content}
          disabled={isProcessing}
          autoComplete="off"
          spellCheck={true}
          aria-describedby={processingError ? processingErrorId : undefined}
          aria-busy={isProcessing}
          onChange={(e) => {
            setProcessingError(null);
            setContent(e.target.value);
          }}
          className="w-full p-4 text-sm md:text-base focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-400/40 resize-none bg-white/50 dark:bg-card/50 text-gray-800 dark:text-foreground min-h-[100px] max-h-[50vh] overflow-y-auto custom-scrollbar"
        />
      </div>

      {processingError ? (
        <div
          id={processingErrorId}
          role="status"
          aria-live="polite"
          className="mx-2 mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
        >
          {processingError}
        </div>
      ) : null}

      {/* Artifact / Edit Toolbar - Rounded Bottom */}
      <div className="bg-white/40 dark:bg-muted/40 border-t border-white/50 dark:border-border p-2 flex items-center justify-between flex-wrap gap-2 backdrop-blur-sm relative z-10 rounded-b-xl">
        <div className="flex items-center gap-1">
          {/* Level Dropdown */}
          <div className="relative">
            <DropdownMenu
              open={activeDropdown === "level"}
              onOpenChange={(open) => setActiveDropdown(open ? "level" : null)}
            >
              <DropdownMenuTrigger asChild>
                <ArtifactButton
                  icon={<BookOpen size={14} />}
                  label={t("level")}
                  isActive={activeDropdown === "level"}
                  ariaExpanded={activeDropdown === "level"}
                  disabled={isProcessing}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-40"
                aria-label={t("readingLevelOptions")}
              >
                <DropdownItem
                  icon={<GraduationCap size={14} />}
                  label={t("levelPhd")}
                  onClick={() => handleLevelChange("PhD student")}
                />
                <DropdownItem
                  icon={<School size={14} />}
                  label={t("levelCollege")}
                  onClick={() => handleLevelChange("college student")}
                />
                <DropdownItem
                  icon={<PersonStanding size={14} />}
                  label={t("levelTeenager")}
                  onClick={() => handleLevelChange("high school student")}
                />
                <DropdownItem
                  icon={<Baby size={14} />}
                  label={t("levelChild")}
                  onClick={() => handleLevelChange("elementary school student")}
                />
                <DropdownItem
                  icon={<Swords size={14} />}
                  label={t("levelPirate")}
                  onClick={() => handleLevelChange("pirate")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Length Dropdown */}
          <div className="relative">
            <DropdownMenu
              open={activeDropdown === "length"}
              onOpenChange={(open) => setActiveDropdown(open ? "length" : null)}
            >
              <DropdownMenuTrigger asChild>
                <ArtifactButton
                  icon={<AlignLeft size={14} />}
                  label={t("length")}
                  isActive={activeDropdown === "length"}
                  ariaExpanded={activeDropdown === "length"}
                  disabled={isProcessing}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-40"
                aria-label={t("artifactLengthOptions")}
              >
                <DropdownItem
                  icon={<ChevronsUp size={14} />}
                  label={t("lengthLongest")}
                  onClick={() =>
                    handleLengthChange("much longer than it currently is")
                  }
                />
                <DropdownItem
                  icon={<ChevronUp size={14} />}
                  label={t("lengthLong")}
                  onClick={() =>
                    handleLengthChange("slightly longer than it currently is")
                  }
                />
                <DropdownItem
                  icon={<ChevronDown size={14} />}
                  label={t("lengthShorter")}
                  onClick={() =>
                    handleLengthChange("slightly shorter than it currently is")
                  }
                />
                <DropdownItem
                  icon={<ChevronsDown size={14} />}
                  label={t("lengthShortest")}
                  onClick={() =>
                    handleLengthChange("much shorter than it currently is")
                  }
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Translate Dropdown */}
          <div className="relative">
            <DropdownMenu
              open={activeDropdown === "translate"}
              onOpenChange={(open) =>
                setActiveDropdown(open ? "translate" : null)
              }
            >
              <DropdownMenuTrigger asChild>
                <ArtifactButton
                  icon={<Languages size={14} />}
                  label={t("translate")}
                  isActive={activeDropdown === "translate"}
                  ariaExpanded={activeDropdown === "translate"}
                  disabled={isProcessing}
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="max-h-60 w-40 overflow-y-auto custom-scrollbar"
                aria-label={t("translationLanguageOptions")}
              >
                <DropdownItem
                  icon={<span>🇺🇸</span>}
                  label="English"
                  onClick={() => handleTranslate("English")}
                />
                <DropdownItem
                  icon={<span>🇨🇳</span>}
                  label="简体中文"
                  onClick={() => handleTranslate("Simplified Chinese")}
                />
                <DropdownItem
                  icon={<span>🇭🇰</span>}
                  label="繁体中文"
                  onClick={() => handleTranslate("Traditional Chinese")}
                />
                <DropdownItem
                  icon={<span>🇯🇵</span>}
                  label="日本語"
                  onClick={() => handleTranslate("Japanese")}
                />
                <DropdownItem
                  icon={<span>🇰🇷</span>}
                  label="한국어"
                  onClick={() => handleTranslate("Korean")}
                />
                <DropdownItem
                  icon={<span>🇪🇸</span>}
                  label="Español"
                  onClick={() => handleTranslate("Spanish")}
                />
                <DropdownItem
                  icon={<span>🇩🇪</span>}
                  label="Deutsch"
                  onClick={() => handleTranslate("German")}
                />
                <DropdownItem
                  icon={<span>🇫🇷</span>}
                  label="Français"
                  onClick={() => handleTranslate("French")}
                />
                <DropdownItem
                  icon={<span>🇧🇷</span>}
                  label="Português"
                  onClick={() => handleTranslate("Portuguese")}
                />
                <DropdownItem
                  icon={<span>🇷🇺</span>}
                  label="Русский"
                  onClick={() => handleTranslate("Russian")}
                />
                <DropdownItem
                  icon={<span>🇸🇦</span>}
                  label="العربية"
                  onClick={() => handleTranslate("Arabic")}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Continue */}
          <ArtifactButton
            icon={<ScrollText size={14} />}
            label={t("continue")}
            onClick={handleContinue}
            disabled={isProcessing}
          />

          {/* Emoji */}
          <ArtifactButton
            icon={<SmilePlus size={14} />}
            label={t("emoji")}
            onClick={handleEmoji}
            disabled={isProcessing}
          />
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center gap-2">
          <Tooltip content={t("versionHistory")} position="top">
            <button
              type="button"
              aria-label={t("toggleVersionHistory")}
              aria-pressed={showHistory}
              aria-expanded={showHistory}
              aria-controls={historyPanelId}
              onClick={() => setShowHistory(!showHistory)}
              className={`p-1.5 rounded-lg transition-colors border ${artifactFocusClass} ${
                showHistory
                  ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                  : "text-gray-500 dark:text-muted-foreground hover:bg-white/50 dark:hover:bg-accent/50 border-transparent hover:border-gray-200 dark:hover:border-border"
              }`}
            >
              <History size={16} aria-hidden="true" />
            </button>
          </Tooltip>

          <button
            type="button"
            onClick={onCancel}
            className={`px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-muted-foreground hover:bg-white/50 dark:hover:bg-accent/50 rounded-lg transition-colors ${artifactFocusClass}`}
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => onSave(content)}
            disabled={isProcessing}
            aria-busy={isProcessing}
            className={`px-3 py-1.5 text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg transition-colors flex items-center gap-1 shadow-md disabled:opacity-50 disabled:cursor-not-allowed ${artifactFocusClass}`}
          >
            <Check size={14} aria-hidden="true" /> {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ArtifactButtonProps {
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  isActive?: boolean;
  disabled?: boolean;
  ariaExpanded?: boolean;
  ariaControls?: string;
}

const ArtifactButton = React.forwardRef<HTMLButtonElement, ArtifactButtonProps>(
  (
    {
      icon,
      label,
      onClick,
      isActive,
      disabled,
      ariaExpanded,
      ariaControls,
      ...props
    },
    ref,
  ) => (
    <button
      {...props}
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      aria-haspopup={ariaExpanded === undefined ? undefined : "menu"}
      aria-expanded={ariaExpanded}
      aria-controls={ariaExpanded ? ariaControls : undefined}
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-[background-color,border-color,color,opacity] border ${artifactFocusClass} ${
        isActive
          ? "bg-gray-100 dark:bg-accent text-gray-900 dark:text-foreground border-gray-200 dark:border-input"
          : "border-transparent hover:bg-gray-100 dark:hover:bg-accent text-gray-600 dark:text-foreground/85 hover:border-white/40 dark:hover:border-border"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {withHiddenIcon(icon)}
      <span className="hidden sm:inline">{label}</span>
    </button>
  ),
);
ArtifactButton.displayName = "ArtifactButton";

interface DropdownItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}

const DropdownItem = ({ icon, label, onClick }: DropdownItemProps) => (
  <DropdownMenuItem onSelect={onClick}>
    <span
      className="w-4 flex items-center justify-center text-gray-500 dark:text-muted-foreground"
      aria-hidden="true"
    >
      {withHiddenIcon(icon)}
    </span>
    <span>{label}</span>
  </DropdownMenuItem>
);

export default Artifact;
