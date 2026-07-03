import React, { useState, useEffect, useMemo, useRef, useId } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Loader2,
  X,
  Filter,
  Check,
  BotMessageSquare,
  ChevronLeft,
  ChevronRight,
  Plus,
  PenLine,
  Trash2,
  RefreshCcw,
  RefreshCw,
  Sparkles,
  Save,
  Library,
} from "lucide-react";
import { v7 as uuidv7 } from "uuid";
import { useLocale, useTranslations } from "next-intl";
import { LobeAgent, LobeAgentMeta } from "@/types";
import { getAgents, getAgentDetail } from "@/services/api/agentService";
import { useSettingsStore } from "@/store/core/settingsStore";
import { optimizeSystemPrompt } from "@/services/artifactService";
import { streamGenerateContent } from "@/services/api/chatService";
import { useChatStore } from "@/store/core/chatStore";
import SafeImage from "@/components/ui/SafeImage";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createStreamingReplacement } from "@/lib/utils/streamingText";
import { MARKET_LIMITS } from "@/config/limits";
import { normalizeLocalAgent } from "@/lib/market/agents";
import { logDevError } from "@/lib/utils/devLogger";

interface AssistantHubProps {
  onClose: () => void;
  onSelect: (agent: LobeAgent) => void;
}

const ITEMS_PER_PAGE = 24;

// Helper to format category names
const formatCategoryName = (str: string) => {
  if (!str) return "General";
  return str
    .replace(/_/g, " ")
    .replace(
      /\b\w/g,
      (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase(),
    );
};

// --- Assistant Editor Modal ---
const AssistantEditorModal = ({
  agent,
  onSave,
  onClose,
  onDelete,
}: {
  agent?: LobeAgent;
  onSave: (agent: LobeAgent) => void;
  onClose: () => void;
  onDelete?: (identifier: string) => void;
}) => {
  const t = useTranslations("Assistant");
  const isEditing = !!agent;
  const { selectedModel } = useChatStore();

  // Initialize state. If agent exists, populate.
  const [meta, setMeta] = useState<LobeAgentMeta>({
    title: "",
    description: "",
    avatar: "🤖",
    category: "General",
    tags: [],
    systemRole: "",
  });

  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizeError, setOptimizeError] = useState("");
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const isEditorMountedRef = useRef(true);
  const optimizeRunRef = useRef(0);
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const onCloseRef = useRef(onClose);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const editorId = useId();
  const dialogTitleId = `${editorId}-title`;
  const avatarInputId = `${editorId}-avatar`;
  const nameInputId = `${editorId}-name`;
  const categoryInputId = `${editorId}-category`;
  const descriptionInputId = `${editorId}-description`;
  const systemPromptInputId = `${editorId}-system-prompt`;
  const tagInputId = `${editorId}-tag`;

  useEffect(() => {
    optimizeRunRef.current += 1;
    setOptimizeError("");
    setIsOptimizing(false);
    setIsDeleteConfirming(false);
    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }

    if (agent) {
      setMeta({
        title: agent.meta.title || "",
        description: agent.meta.description || "",
        avatar: agent.meta.avatar || "🤖",
        category: agent.meta.category || "General",
        tags: agent.meta.tags || [],
        systemRole: agent.meta.systemRole || "",
      });
    } else {
      setMeta({
        title: "",
        description: "",
        avatar: "🤖",
        category: "General",
        tags: [],
        systemRole: "",
      });
    }
  }, [agent]);

  useEffect(() => {
    isEditorMountedRef.current = true;
    const previousActiveElement =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      isEditorMountedRef.current = false;
      optimizeRunRef.current += 1;
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
        deleteConfirmTimerRef.current = null;
      }
      if (previousActiveElement?.isConnected) {
        previousActiveElement.focus({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const [tagInput, setTagInput] = useState("");

  const clearDeleteConfirmation = () => {
    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }
    setIsDeleteConfirming(false);
  };

  const handleSubmit = () => {
    if (!meta.title.trim() || !meta.description.trim()) return; // Simple validation
    clearDeleteConfirmation();

    const updatedAgent: LobeAgent = {
      identifier: agent?.identifier || uuidv7(),
      meta: meta,
      createdAt: agent?.createdAt || new Date().toISOString(),
      homepage: agent?.homepage || "",
      author: agent?.author || "User",
      isCustom: agent?.isCustom ?? true,
    };
    const normalizedAgent = normalizeLocalAgent(updatedAgent);
    if (!normalizedAgent) return;

    onSave(normalizedAgent);
    onClose();
  };

  const handleDelete = () => {
    if (agent && onDelete) {
      if (!isDeleteConfirming) {
        setIsDeleteConfirming(true);
        if (deleteConfirmTimerRef.current) {
          clearTimeout(deleteConfirmTimerRef.current);
        }
        deleteConfirmTimerRef.current = setTimeout(() => {
          deleteConfirmTimerRef.current = null;
          setIsDeleteConfirming(false);
        }, 5000);
        return;
      }

      clearDeleteConfirmation();
      onDelete(agent.identifier);
      onClose();
    }
  };

  const handleAddTag = () => {
    const tag = tagInput.trim().slice(0, MARKET_LIMITS.maxAgentTagChars);
    if (
      tag &&
      meta.tags.length < MARKET_LIMITS.maxAgentTags &&
      !meta.tags.some((item) => item.toLowerCase() === tag.toLowerCase())
    ) {
      setMeta((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput("");
    }
  };

  const removeTag = (tag: string) => {
    setMeta((prev) => ({ ...prev, tags: prev.tags.filter((t) => t !== tag) }));
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCloseRef.current();
      return;
    }

    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusableElements = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => element.offsetParent !== null);

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

  const handleOptimize = async () => {
    if (!meta.systemRole?.trim() || isOptimizing) return;

    const runId = optimizeRunRef.current + 1;
    optimizeRunRef.current = runId;
    setIsOptimizing(true);
    setOptimizeError("");
    const originalSystemRole = meta.systemRole;
    const replacement = createStreamingReplacement(originalSystemRole);
    const prompt = optimizeSystemPrompt(meta.systemRole);

    try {
      await streamGenerateContent(selectedModel, prompt, (chunk) => {
        if (!isEditorMountedRef.current || optimizeRunRef.current !== runId) {
          return;
        }
        setMeta((prev) => ({
          ...prev,
          systemRole: replacement.append(chunk),
        }));
      });
      if (!isEditorMountedRef.current || optimizeRunRef.current !== runId) {
        return;
      }
      const optimizedText = replacement.value();
      if (!optimizedText.trim()) {
        throw new Error("Prompt optimization returned empty content");
      }
      setMeta((prev) => ({ ...prev, systemRole: optimizedText }));
    } catch {
      if (!isEditorMountedRef.current || optimizeRunRef.current !== runId) {
        return;
      }
      setMeta((prev) => ({
        ...prev,
        systemRole: replacement.restore(),
      }));
      setOptimizeError(t("optimizeFailed"));
    } finally {
      if (isEditorMountedRef.current && optimizeRunRef.current === runId) {
        setIsOptimizing(false);
      }
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onCloseRef.current();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden overscroll-contain rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-border dark:bg-card"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-border">
          <h3
            id={dialogTitleId}
            className="text-lg font-bold text-gray-800 dark:text-foreground"
          >
            {isEditing ? t("editAssistant") : t("createAssistant")}
          </h3>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label={t("closeEditor")}
            onClick={onClose}
            className="rounded-full p-1 text-gray-500 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:hover:bg-muted"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          {/* Avatar & Title */}
          <div className="flex gap-4">
            <div className="space-y-1">
              <label
                htmlFor={avatarInputId}
                className="text-xs font-semibold text-gray-500 dark:text-muted-foreground"
              >
                {t("avatar")}
              </label>
              <div className="w-16 h-16 rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted flex items-center justify-center text-2xl overflow-hidden relative group">
                {meta.avatar.startsWith("http") ? (
                  <SafeImage
                    src={meta.avatar}
                    alt={t("avatarPreviewAlt")}
                    className="w-full h-full object-cover"
                    fallback={
                      <BotMessageSquare
                        size={24}
                        className="text-gray-400"
                        aria-hidden="true"
                      />
                    }
                  />
                ) : (
                  <span aria-hidden="true">{meta.avatar}</span>
                )}
                <input
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  tabIndex={-1}
                  aria-hidden="true"
                  type="text"
                  value={meta.avatar}
                  onChange={(e) => setMeta({ ...meta, avatar: e.target.value })}
                  maxLength={MARKET_LIMITS.maxAgentAvatarChars}
                  placeholder={t("emojiOrUrl")}
                />
              </div>
              <input
                id={avatarInputId}
                name="assistant-avatar"
                autoComplete="off"
                spellCheck={false}
                className="w-16 border-b border-gray-200 bg-transparent text-center text-[10px] outline-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/40 dark:border-border"
                value={meta.avatar}
                onChange={(e) => setMeta({ ...meta, avatar: e.target.value })}
                maxLength={MARKET_LIMITS.maxAgentAvatarChars}
                placeholder={t("emojiUrlShort")}
              />
            </div>
            <div className="flex-1 space-y-1">
              <label
                htmlFor={nameInputId}
                className="text-xs font-semibold text-gray-500 dark:text-muted-foreground"
              >
                {t("name")}
              </label>
              <input
                id={nameInputId}
                name="assistant-name"
                autoComplete="off"
                spellCheck={false}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium text-gray-800 dark:text-foreground"
                placeholder={t("namePlaceholder")}
                value={meta.title}
                maxLength={MARKET_LIMITS.maxAgentTitleChars}
                onChange={(e) => setMeta({ ...meta, title: e.target.value })}
              />

              <div className="flex gap-2 pt-2">
                <div className="flex-1 space-y-1">
                  <label
                    htmlFor={categoryInputId}
                    className="text-xs font-semibold text-gray-500 dark:text-muted-foreground"
                  >
                    {t("category")}
                  </label>
                  <input
                    id={categoryInputId}
                    name="assistant-category"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full px-3 py-2 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-xs"
                    placeholder={t("category")}
                    value={meta.category}
                    maxLength={MARKET_LIMITS.maxAgentCategoryChars}
                    onChange={(e) =>
                      setMeta({ ...meta, category: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor={descriptionInputId}
              className="text-xs font-semibold text-gray-500 dark:text-muted-foreground"
            >
              {t("description")}
            </label>
            <textarea
              id={descriptionInputId}
              name="assistant-description"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm resize-none h-20"
              placeholder={t("descriptionPlaceholder")}
              value={meta.description}
              maxLength={MARKET_LIMITS.maxAgentDescriptionChars}
              onChange={(e) =>
                setMeta({ ...meta, description: e.target.value })
              }
            />
          </div>

          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <label
                htmlFor={systemPromptInputId}
                className="flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-muted-foreground"
              >
                <Sparkles
                  size={12}
                  className="text-blue-500"
                  aria-hidden="true"
                />{" "}
                {t("systemPrompt")}
              </label>

              <button
                type="button"
                aria-label={t("optimizeSystemPromptAria")}
                aria-busy={isOptimizing || undefined}
                onClick={handleOptimize}
                disabled={isOptimizing || !meta.systemRole}
                className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-[10px] text-blue-600 transition-colors hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-blue-900/20 dark:text-blue-400 dark:hover:bg-blue-900/30"
              >
                {isOptimizing ? (
                  <Loader2
                    size={10}
                    className="animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles size={10} aria-hidden="true" />
                )}
                {t("optimize")}
              </button>
            </div>
            <div className="relative">
              {optimizeError && (
                <div
                  role="alert"
                  className="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-300"
                >
                  {optimizeError}
                </div>
              )}
              {isOptimizing && (
                <div
                  role="status"
                  aria-live="polite"
                  className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-white/50 backdrop-blur-[1px] dark:bg-card/50"
                >
                  <div className="bg-white dark:bg-muted px-3 py-1.5 rounded-full shadow-sm border border-gray-100 dark:border-border flex items-center gap-2 text-xs font-medium text-blue-600">
                    <Loader2
                      size={12}
                      className="animate-spin"
                      aria-hidden="true"
                    />{" "}
                    {t("optimizing")}
                  </div>
                </div>
              )}
              <textarea
                id={systemPromptInputId}
                name="assistant-system-prompt"
                spellCheck={false}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-mono resize-none h-32 custom-scrollbar"
                placeholder={t("systemPromptPlaceholder")}
                value={meta.systemRole}
                maxLength={MARKET_LIMITS.maxAgentSystemRoleChars}
                onChange={(e) =>
                  setMeta({ ...meta, systemRole: e.target.value })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <label
              htmlFor={tagInputId}
              className="text-xs font-semibold text-gray-500 dark:text-muted-foreground"
            >
              {t("tagsOptional")}
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {meta.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-muted rounded-lg text-xs text-gray-600 dark:text-foreground/85"
                >
                  #{tag}
                  <button
                    type="button"
                    aria-label={t("removeTagAria", { tag })}
                    onClick={() => removeTag(tag)}
                    className="rounded-sm hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
                  >
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                id={tagInputId}
                name="assistant-tag"
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-border dark:bg-muted"
                placeholder={t("addTagPlaceholder")}
                value={tagInput}
                maxLength={MARKET_LIMITS.maxAgentTagChars}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
              />
              <button
                type="button"
                aria-label={t("addTagAria")}
                onClick={handleAddTag}
                disabled={meta.tags.length >= MARKET_LIMITS.maxAgentTags}
                className="rounded-xl bg-gray-100 px-3 py-2 text-gray-600 hover:bg-gray-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-muted dark:text-foreground/85 dark:hover:bg-accent"
              >
                <Plus size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 dark:border-border bg-gray-50/50 dark:bg-card/50 flex justify-between gap-3">
          {onDelete && (
            <button
              type="button"
              aria-label={
                isDeleteConfirming
                  ? t("confirmDeleteAssistantAria", {
                      title: agent?.meta.title || "",
                    })
                  : t("deleteAssistantAria", { title: agent?.meta.title || "" })
              }
              onClick={handleDelete}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 ${
                isDeleteConfirming
                  ? "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-200"
                  : "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
              }`}
            >
              {isDeleteConfirming ? (
                <Check size={16} aria-hidden="true" />
              ) : (
                <Trash2 size={16} aria-hidden="true" />
              )}
              {isDeleteConfirming ? t("confirmDelete") : t("delete")}
            </button>
          )}
          {!onDelete && <div></div>}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl px-4 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-muted-foreground dark:hover:bg-muted"
            >
              {t("cancel")}
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-2 text-sm font-medium text-white shadow-lg shadow-blue-500/20 transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background"
            >
              <Save size={16} aria-hidden="true" /> {t("saveAssistant")}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

interface AssistantCardProps {
  agent: LobeAgent;
  onClick: (agent: LobeAgent) => void;
  onEdit: (e: React.MouseEvent, agent: LobeAgent) => void;
  onDelete?: (e: React.MouseEvent, id: string) => void;
  onReset?: (e: React.MouseEvent, id: string) => void;
  hasOverride?: boolean;
  isDetailLoading?: boolean;
}

const AssistantCard: React.FC<AssistantCardProps> = ({
  agent,
  onClick,
  onEdit,
  onDelete,
  onReset,
  hasOverride,
  isDetailLoading,
}) => {
  const t = useTranslations("Assistant");
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isResetConfirming, setIsResetConfirming] = useState(false);
  const deleteConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const resetConfirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    return () => {
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
        deleteConfirmTimerRef.current = null;
      }
      if (resetConfirmTimerRef.current) {
        clearTimeout(resetConfirmTimerRef.current);
        resetConfirmTimerRef.current = null;
      }
    };
  }, []);

  const clearDeleteConfirmation = () => {
    if (deleteConfirmTimerRef.current) {
      clearTimeout(deleteConfirmTimerRef.current);
      deleteConfirmTimerRef.current = null;
    }
    setIsDeleteConfirming(false);
  };

  const clearResetConfirmation = () => {
    if (resetConfirmTimerRef.current) {
      clearTimeout(resetConfirmTimerRef.current);
      resetConfirmTimerRef.current = null;
    }
    setIsResetConfirming(false);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onDelete) return;

    if (!isDeleteConfirming) {
      setIsDeleteConfirming(true);
      if (deleteConfirmTimerRef.current) {
        clearTimeout(deleteConfirmTimerRef.current);
      }
      deleteConfirmTimerRef.current = setTimeout(() => {
        deleteConfirmTimerRef.current = null;
        setIsDeleteConfirming(false);
      }, 3500);
      return;
    }

    clearDeleteConfirmation();
    onDelete(e, agent.identifier);
  };

  const handleResetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onReset) return;

    if (!isResetConfirming) {
      setIsResetConfirming(true);
      if (resetConfirmTimerRef.current) {
        clearTimeout(resetConfirmTimerRef.current);
      }
      resetConfirmTimerRef.current = setTimeout(() => {
        resetConfirmTimerRef.current = null;
        setIsResetConfirming(false);
      }, 3500);
      return;
    }

    clearResetConfirmation();
    onReset(e, agent.identifier);
  };

  const renderAvatar = (avatar: string) => {
    const isUrl =
      avatar.startsWith("http") ||
      avatar.startsWith("data:") ||
      avatar.includes("/");
    if (isUrl) {
      return (
        <SafeImage
          src={avatar}
          alt={t("avatarAlt", { title: agent.meta.title })}
          className="w-full h-full object-cover"
          loading="lazy"
          fallback={
            <BotMessageSquare
              size={20}
              className="text-gray-400"
              aria-hidden="true"
            />
          }
        />
      );
    }
    return (
      <span className="text-xl" aria-hidden="true">
        {avatar}
      </span>
    );
  };

  return (
    <article
      className={`group relative flex h-full overflow-hidden rounded-2xl border bg-white/40 backdrop-blur-md transition-[border-color,box-shadow] duration-300 dark:bg-muted/40 ${
        hasOverride
          ? "border-rose-200 dark:border-rose-900/50"
          : "border-gray-200 hover:border-rose-300 hover:shadow-lg hover:shadow-rose-500/5 dark:border-border dark:hover:border-rose-700"
      }`}
    >
      <button
        type="button"
        aria-label={t("selectAssistantAria", { title: agent.meta.title })}
        onClick={() => onClick(agent)}
        className="flex h-full w-full flex-col p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-500 dark:focus-visible:ring-rose-400"
      >
        <div className="mb-3 flex items-center justify-between gap-3 pr-16">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-white dark:border-input dark:bg-accent">
              {renderAvatar(agent.meta.avatar)}
            </div>

            <div className="flex min-w-0 flex-col items-start gap-1">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                {agent.isCustom && (
                  <span className="shrink-0 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                    <span className="truncate">{t("custom")}</span>
                  </span>
                )}
                {hasOverride && (
                  <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    <span className="truncate">{t("edited")}</span>
                  </span>
                )}
                {agent.meta.category && (
                  <span className="max-w-25 shrink-0 truncate rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-accent dark:text-foreground/85">
                    {formatCategoryName(agent.meta.category)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <h3 className="mb-1 truncate text-sm font-bold text-gray-800 transition-colors group-hover:text-rose-600 dark:text-foreground dark:group-hover:text-rose-400">
          {agent.meta.title}
        </h3>
        <p className="mb-3 line-clamp-2 flex-1 text-xs leading-relaxed text-gray-500 dark:text-muted-foreground">
          {agent.meta.description}
        </p>

        <div className="mt-auto flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap gap-1">
            {agent.meta.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="max-w-24 truncate rounded border border-rose-100 bg-rose-50 px-1.5 py-0.5 text-[9px] text-rose-600 dark:border-rose-900/30 dark:bg-rose-900/10 dark:text-rose-400"
              >
                #{tag}
              </span>
            ))}
            {agent.meta.tags.length > 3 && (
              <span className="px-1.5 py-0.5 text-[9px] text-gray-400">
                +{agent.meta.tags.length - 3}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="absolute right-4 top-4 z-10 flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          type="button"
          aria-label={t("editAssistantAria", { title: agent.meta.title })}
          aria-busy={isDetailLoading || undefined}
          onClick={(e) => onEdit(e, agent)}
          className="relative rounded-lg border border-gray-200 bg-white/90 p-1.5 text-gray-500 shadow-sm backdrop-blur-sm transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 disabled:cursor-not-allowed disabled:opacity-60 dark:border-border dark:bg-popover/90 dark:text-muted-foreground dark:hover:bg-blue-900/30 dark:hover:text-blue-400"
          disabled={isDetailLoading}
        >
          {isDetailLoading ? (
            <Loader2
              size={14}
              className="animate-spin text-blue-500"
              aria-hidden="true"
            />
          ) : (
            <PenLine size={14} aria-hidden="true" />
          )}
        </button>
        {onDelete && (
          <button
            type="button"
            aria-label={
              isDeleteConfirming
                ? t("confirmDeleteAssistantAria", { title: agent.meta.title })
                : t("deleteAssistantAria", { title: agent.meta.title })
            }
            onClick={handleDeleteClick}
            className={`rounded-lg border border-gray-200 bg-white/90 p-1.5 shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 dark:border-border dark:bg-popover/90 ${
              isDeleteConfirming
                ? "text-red-600 dark:text-red-300"
                : "text-gray-500 hover:bg-red-50 hover:text-red-600 dark:text-muted-foreground dark:hover:bg-red-900/30 dark:hover:text-red-400"
            }`}
          >
            {isDeleteConfirming ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Trash2 size={14} aria-hidden="true" />
            )}
          </button>
        )}
        {hasOverride && onReset && !onDelete && (
          <button
            type="button"
            aria-label={
              isResetConfirming
                ? t("confirmResetAria", { title: agent.meta.title })
                : t("resetAria", { title: agent.meta.title })
            }
            onClick={handleResetClick}
            className={`rounded-lg border border-gray-200 bg-white/90 p-1.5 shadow-sm backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/60 dark:border-border dark:bg-popover/90 ${
              isResetConfirming
                ? "text-amber-600 dark:text-amber-300"
                : "text-gray-500 hover:bg-amber-50 hover:text-amber-600 dark:text-muted-foreground dark:hover:bg-amber-900/30 dark:hover:text-amber-400"
            }`}
          >
            {isResetConfirming ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <RefreshCcw size={14} aria-hidden="true" />
            )}
          </button>
        )}
      </div>
    </article>
  );
};

const AssistantHub: React.FC<AssistantHubProps> = ({ onClose, onSelect }) => {
  const t = useTranslations("Assistant");
  const locale = useLocale();
  const {
    customAgents,
    usedAgents,
    agentOverrides,
    addCustomAgent,
    updateAgent,
    removeLocalAgent,
    resetAgent,
    recordUsedAgent,
  } = useSettingsStore();

  const [apiAgents, setApiAgents] = useState<LobeAgent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Modal State
  const [editingAgent, setEditingAgent] = useState<LobeAgent | undefined>(
    undefined,
  );
  const [showEditor, setShowEditor] = useState(false);
  const [loadingAgentId, setLoadingAgentId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const agentListRequestRef = useRef(0);
  const agentDetailRequestRef = useRef(0);

  // Pagination & Filtering
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]); // Multi-select
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const searchInputId = useId();

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      agentListRequestRef.current += 1;
      agentDetailRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const load = async () => {
      const requestId = agentListRequestRef.current + 1;
      agentListRequestRef.current = requestId;
      setIsLoading(true);
      try {
        const list = await getAgents(false, locale);
        if (isMountedRef.current && agentListRequestRef.current === requestId) {
          setApiAgents(list);
        }
      } catch (error) {
        if (agentListRequestRef.current === requestId) {
          logDevError("Failed to load agents:", error);
        }
      } finally {
        if (isMountedRef.current && agentListRequestRef.current === requestId) {
          setIsLoading(false);
        }
      }
    };
    load();
  }, [locale]);

  const handleRefresh = async () => {
    const requestId = agentListRequestRef.current + 1;
    agentListRequestRef.current = requestId;
    setIsRefreshing(true);
    try {
      const list = await getAgents(true, locale); // Force refresh
      if (isMountedRef.current && agentListRequestRef.current === requestId) {
        setApiAgents(list);
      }
    } catch (error) {
      if (agentListRequestRef.current === requestId) {
        logDevError("Failed to refresh agents:", error);
      }
    } finally {
      if (isMountedRef.current && agentListRequestRef.current === requestId) {
        setIsRefreshing(false);
      }
    }
  };

  // Prepare Local Assistants List (Custom + Used + Overridden)
  const localAgents = useMemo(() => {
    const uniqueLocal = new Map<string, LobeAgent>();

    // 1. Add Custom Agents
    customAgents.forEach((a) =>
      uniqueLocal.set(a.identifier, { ...a, isCustom: true }),
    );

    // 2. Add Used Agents (Apply Overrides if present)
    usedAgents.forEach((a) => {
      if (!uniqueLocal.has(a.identifier)) {
        const override = agentOverrides[a.identifier];
        const merged = override
          ? { ...a, ...override, meta: { ...a.meta, ...override.meta } }
          : a;
        uniqueLocal.set(a.identifier, merged);
      }
    });

    // 3. Add any remote agent that has an override but wasn't in usedAgents (edge case)
    apiAgents.forEach((a) => {
      if (agentOverrides[a.identifier] && !uniqueLocal.has(a.identifier)) {
        const override = agentOverrides[a.identifier];
        uniqueLocal.set(a.identifier, {
          ...a,
          ...override,
          meta: { ...a.meta, ...override.meta },
        });
      }
    });

    return Array.from(uniqueLocal.values());
  }, [customAgents, usedAgents, agentOverrides, apiAgents]);

  // Combine Data for "All" listing: API Agents (with Overrides)
  const mergedApiAgents = useMemo(() => {
    return apiAgents.map((agent) => {
      const override = agentOverrides[agent.identifier];
      if (override) {
        return {
          ...agent,
          ...override,
          meta: { ...agent.meta, ...override.meta }, // Deep merge meta
        };
      }
      return agent;
    });
  }, [apiAgents, agentOverrides]);

  // Reset to page 1 when search or category changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCategories]);

  // Derive Categories from API list
  const categories = useMemo(() => {
    const cats = new Set<string>();
    mergedApiAgents.forEach((a) => {
      if (a.meta.category) {
        cats.add(a.meta.category);
      }
    });
    return Array.from(cats).sort();
  }, [mergedApiAgents]);

  // Filtering & Sorting for API List
  const filteredApiAgents = useMemo(() => {
    return mergedApiAgents.filter((a) => {
      const matchesSearch =
        a.meta.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.meta.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.meta.tags.some((tag) =>
          tag.toLowerCase().includes(searchTerm.toLowerCase()),
        );

      const matchesCategory =
        selectedCategories.length === 0
          ? true
          : selectedCategories.includes(a.meta.category);

      return matchesSearch && matchesCategory;
    });
  }, [mergedApiAgents, searchTerm, selectedCategories]);

  // Filtering for Local List
  const filteredLocalAgents = useMemo(() => {
    return localAgents.filter(
      (a) =>
        a.meta.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        a.meta.description.toLowerCase().includes(searchTerm.toLowerCase()),
    );
  }, [localAgents, searchTerm]);

  // Pagination Logic for API list
  const totalPages = Math.ceil(filteredApiAgents.length / ITEMS_PER_PAGE);
  const paginatedApiAgents = filteredApiAgents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) => {
      if (prev.includes(cat)) {
        return prev.filter((c) => c !== cat);
      } else {
        return [...prev, cat];
      }
    });
  };

  const handleEditClick = async (e: React.MouseEvent, agent: LobeAgent) => {
    e.stopPropagation();
    const requestId = agentDetailRequestRef.current + 1;
    agentDetailRequestRef.current = requestId;

    if (agent.isCustom) {
      // Custom agents already have full data locally
      setEditingAgent(agent);
      setShowEditor(true);
    } else {
      // For remote agents, fetch the full details to get systemRole
      setLoadingAgentId(agent.identifier);
      try {
        const detail = await getAgentDetail(agent.identifier, locale);
        if (
          !isMountedRef.current ||
          agentDetailRequestRef.current !== requestId
        ) {
          return;
        }
        // Merge detail config into meta for editing purposes
        const fullAgent = {
          ...agent,
          meta: {
            ...agent.meta,
            ...detail.meta, // Refresh meta from details if newer
            systemRole: detail.config?.systemRole || agent.meta.systemRole,
          },
        };
        setEditingAgent(fullAgent);
        setShowEditor(true);
      } catch (error) {
        if (
          !isMountedRef.current ||
          agentDetailRequestRef.current !== requestId
        ) {
          return;
        }
        logDevError("Failed to load agent details:", error);
        // Fallback to opening editor with what we have
        setEditingAgent(agent);
        setShowEditor(true);
      } finally {
        if (
          isMountedRef.current &&
          agentDetailRequestRef.current === requestId
        ) {
          setLoadingAgentId(null);
        }
      }
    }
  };

  const handleDeleteLocal = (e: React.MouseEvent, identifier: string) => {
    e.stopPropagation();
    removeLocalAgent(identifier);
  };

  const handleEditorDelete = (identifier: string) => {
    removeLocalAgent(identifier);
  };

  const handleResetOverride = (e: React.MouseEvent, identifier: string) => {
    e.stopPropagation();
    resetAgent(identifier);
  };

  const handleSaveAgent = (savedAgent: LobeAgent) => {
    if (savedAgent.isCustom) {
      // If editing an existing custom agent vs creating new
      const exists = customAgents.some(
        (a) => a.identifier === savedAgent.identifier,
      );
      if (exists) {
        updateAgent(savedAgent.identifier, savedAgent, true);
      } else {
        addCustomAgent(savedAgent);
      }
    } else {
      // Saving an override for a built-in agent
      updateAgent(savedAgent.identifier, savedAgent, false);
    }
  };

  const handleCreateNew = () => {
    setEditingAgent(undefined);
    setShowEditor(true);
  };

  const handleSelectWrapper = (agent: LobeAgent) => {
    // Record usage for local history
    recordUsedAgent(agent);
    onSelect(agent);
  };

  return (
    <div className="flex flex-col h-full w-full relative overflow-hidden animate-in fade-in duration-300">
      {showEditor && (
        <AssistantEditorModal
          agent={editingAgent}
          onSave={handleSaveAgent}
          onClose={() => setShowEditor(false)}
          onDelete={editingAgent?.isCustom ? handleEditorDelete : undefined}
        />
      )}

      {/* Header */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b border-gray-200/50 bg-white/40 px-6 py-4 backdrop-blur-md dark:border-border dark:bg-card/40">
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-linear-to-tr from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-500/20"
            aria-hidden="true"
          >
            <BotMessageSquare size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-gray-800 dark:text-foreground">
              {t("hubTitle")}
            </h1>
            <p className="truncate text-xs text-gray-500 dark:text-muted-foreground">
              {t("hubSubtitle")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            aria-label={t("refreshAgentsAria")}
            aria-busy={isRefreshing || undefined}
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:text-muted-foreground dark:hover:bg-accent/50"
          >
            <RefreshCw
              size={18}
              className={isRefreshing ? "animate-spin" : ""}
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            aria-label={t("closeHubAria")}
            onClick={onClose}
            className="rounded-full p-2 text-gray-500 transition-colors hover:bg-gray-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 dark:text-muted-foreground dark:hover:bg-accent/50"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mx-auto flex w-full max-w-7xl shrink-0 gap-3 px-6 pb-6 pt-6">
        <div className="group relative min-w-0 flex-1">
          <div className="absolute inset-0 bg-rose-500/20 dark:bg-rose-500/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="relative flex items-center rounded-2xl border border-gray-200 bg-white/60 px-4 py-3 shadow-sm backdrop-blur-xl transition-[border-color,box-shadow] focus-within:border-rose-500/50 focus-within:ring-2 focus-within:ring-rose-500/30 dark:border-border dark:bg-muted/60">
            <label htmlFor={searchInputId} className="sr-only">
              {t("searchLabel")}
            </label>
            <Search
              size={20}
              className="mr-3 text-gray-400"
              aria-hidden="true"
            />
            <input
              id={searchInputId}
              type="text"
              name="assistant-search"
              autoComplete="off"
              spellCheck={false}
              placeholder={t("searchPlaceholder")}
              className="min-w-0 flex-1 border-none bg-transparent text-base text-gray-800 outline-none placeholder-gray-400 dark:text-foreground"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Content Grid */}
      <div className="flex-1 overflow-y-auto px-6 pb-10 custom-scrollbar">
        <div className="max-w-7xl mx-auto flex flex-col min-h-full gap-8">
          {/* Local Assistants Section */}
          <div>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <h2 className="flex min-w-0 items-center gap-2 truncate text-sm font-bold uppercase tracking-wider text-gray-800 dark:text-foreground">
                <Library
                  size={16}
                  className="text-rose-500"
                  aria-hidden="true"
                />
                <span className="truncate">{t("localAssistants")}</span>
              </h2>
              <button
                type="button"
                aria-label={t("createCustomAria")}
                onClick={handleCreateNew}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/30"
              >
                <Plus size={14} aria-hidden="true" /> {t("custom")}
              </button>
            </div>

            {filteredLocalAgents.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredLocalAgents.map((agent) => (
                  <AssistantCard
                    key={agent.identifier}
                    agent={agent}
                    onClick={handleSelectWrapper}
                    onEdit={handleEditClick}
                    onDelete={handleDeleteLocal}
                    onReset={handleResetOverride}
                    hasOverride={!!agentOverrides[agent.identifier]}
                    isDetailLoading={loadingAgentId === agent.identifier}
                  />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400 text-sm">
                {t("noLocalAssistants")}
              </div>
            )}
          </div>

          {/* All Assistants Section */}
          <div className="flex-1 flex flex-col">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <h2 className="min-w-0 truncate text-sm font-bold uppercase tracking-wider text-gray-500 dark:text-muted-foreground">
                {searchTerm
                  ? t("foundRemote", { count: filteredApiAgents.length })
                  : t("allAssistants")}
              </h2>

              {/* Category Filter */}
              <div className="relative shrink-0">
                <DropdownMenu
                  open={showCategoryFilter}
                  onOpenChange={setShowCategoryFilter}
                >
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={
                        selectedCategories.length > 0
                          ? t("filterCategoriesSelectedAria", {
                              count: selectedCategories.length,
                            })
                          : t("filterCategoriesAria")
                      }
                      className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 ${
                        selectedCategories.length > 0
                          ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400"
                          : "bg-transparent text-gray-600 hover:bg-gray-100 dark:text-foreground/85 dark:hover:bg-muted"
                      }`}
                    >
                      <Filter size={12} aria-hidden="true" />
                      <span>
                        {selectedCategories.length > 0
                          ? t("selectedCount", {
                              count: selectedCategories.length,
                            })
                          : t("filter")}
                      </span>
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent
                    side="bottom"
                    align="end"
                    className="max-h-80 w-64 overflow-y-auto custom-scrollbar"
                  >
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={selectedCategories.length === 0}
                      onSelect={() => setSelectedCategories([])}
                    >
                      {t("clearSelection")}
                    </DropdownMenuItem>
                    {categories.map((cat) => (
                      <DropdownMenuCheckboxItem
                        key={cat}
                        checked={selectedCategories.includes(cat)}
                        onSelect={(event) => event.preventDefault()}
                        onCheckedChange={() => toggleCategory(cat)}
                      >
                        <span className="truncate">
                          {formatCategoryName(cat)}
                        </span>
                      </DropdownMenuCheckboxItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {isLoading ? (
              <div
                role="status"
                aria-live="polite"
                className="flex h-64 flex-col items-center justify-center gap-4 text-gray-400"
              >
                <Loader2
                  size={32}
                  className="animate-spin text-rose-500"
                  aria-hidden="true"
                />
                <span className="text-sm font-medium">
                  {t("loadingAssistants")}
                </span>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 flex-1 content-start">
                  {paginatedApiAgents.map((agent) => (
                    <AssistantCard
                      key={agent.identifier}
                      agent={agent}
                      onClick={handleSelectWrapper}
                      onEdit={handleEditClick}
                      onReset={handleResetOverride}
                      hasOverride={!!agentOverrides[agent.identifier]}
                      isDetailLoading={loadingAgentId === agent.identifier}
                    />
                  ))}
                </div>

                {paginatedApiAgents.length === 0 && (
                  <div className="text-center py-12 text-gray-400">
                    <p>{t("noAssistantsFound")}</p>
                  </div>
                )}

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="py-6 flex items-center justify-center gap-4 mt-auto">
                    <button
                      type="button"
                      aria-label={t("prevPageAria")}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-muted dark:text-foreground/85 dark:hover:bg-accent"
                    >
                      <ChevronLeft size={16} aria-hidden="true" />
                    </button>
                    <span className="text-sm font-medium tabular-nums text-gray-600 dark:text-foreground/85">
                      {t("pageOf", { currentPage, totalPages })}
                    </span>
                    <button
                      type="button"
                      aria-label={t("nextPageAria")}
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                      className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-border dark:bg-muted dark:text-foreground/85 dark:hover:bg-accent"
                    >
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssistantHub;
