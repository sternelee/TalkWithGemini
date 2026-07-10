"use client";

import React, { useMemo, useState } from "react";
import {
  Brain,
  Check,
  Database,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { MEMORY_LIMITS } from "@/config/limits";
import { performMemoryDream } from "@/services/api/chatService";
import { useMemoryStore } from "@/store/core/memoryStore";
import type { MemoryRecord, MemoryType } from "@/types";
import { CustomSelect, SimpleSwitch } from "./SettingsUI";

const MEMORY_TYPE_OPTIONS: Array<{ value: MemoryType; labelKey: string }> = [
  { value: "fact", labelKey: "typeFact" },
  { value: "preference", labelKey: "typePreference" },
  { value: "instruction", labelKey: "typeInstruction" },
  { value: "project", labelKey: "typeProject" },
  { value: "warning", labelKey: "typeWarning" },
  { value: "decision", labelKey: "typeDecision" },
  { value: "context", labelKey: "typeContext" },
];

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, MEMORY_LIMITS.maxTags);
}

function formatDate(timestamp: number | undefined, locale: string): string {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

const MemorySettings = () => {
  const t = useTranslations("Memory");
  const locale = useLocale();
  const {
    settings,
    memories,
    dreamStatus,
    updateMemorySettings,
    addMemory,
    updateMemory,
    removeMemory,
  } = useMemoryStore();
  const [query, setQuery] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");
  const [type, setType] = useState<MemoryType>("fact");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dreamError, setDreamError] = useState<string | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const typeOptions = useMemo(
    () =>
      MEMORY_TYPE_OPTIONS.map((option) => ({
        value: option.value,
        label: t(option.labelKey),
      })),
    [t],
  );

  const filteredMemories = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return memories;
    return memories.filter((memory) => {
      return (
        memory.content.toLowerCase().includes(term) ||
        memory.type.includes(term) ||
        memory.tags.some((tag) => tag.toLowerCase().includes(term))
      );
    });
  }, [memories, query]);

  const resetForm = () => {
    setEditingId(null);
    setContent("");
    setTags("");
    setType("fact");
    setContentError(null);
  };

  const handleSave = () => {
    if (!content.trim()) {
      setContentError(t("contentRequired"));
      return;
    }
    setContentError(null);
    const next = {
      type,
      content,
      tags: parseTags(tags),
      source: "manual" as const,
      importance: 3,
    };

    if (editingId) {
      updateMemory(editingId, next);
    } else {
      addMemory(next);
    }
    resetForm();
  };

  const handleEdit = (memory: MemoryRecord) => {
    setEditingId(memory.id);
    setContent(memory.content);
    setTags(memory.tags.join(", "));
    setType(memory.type);
    setContentError(null);
    setPendingDeleteId(null);
  };

  const handleDreamNow = async () => {
    setDreamError(null);
    try {
      await performMemoryDream({ force: true });
    } catch (error) {
      setDreamError(error instanceof Error ? error.message : t("dreamError"));
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-gray-800 dark:text-foreground">
              <Brain size={20} className="text-cyan-500" aria-hidden="true" />
              {t("title")}
            </h3>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-gray-500 dark:text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-muted-foreground">
              {settings.enabled ? t("enabled") : t("disabled")}
            </span>
            <SimpleSwitch
              ariaLabel={t("enableAria")}
              name="memoryEnabled"
              checked={settings.enabled}
              onChange={() =>
                updateMemorySettings({ enabled: !settings.enabled })
              }
            />
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              label: t("searchToggle"),
              desc: t("searchToggleDesc"),
              checked: settings.searchEnabled,
              onChange: () =>
                updateMemorySettings({
                  searchEnabled: !settings.searchEnabled,
                }),
            },
            {
              label: t("recordToggle"),
              desc: t("recordToggleDesc"),
              checked: settings.autoRecordEnabled,
              onChange: () =>
                updateMemorySettings({
                  autoRecordEnabled: !settings.autoRecordEnabled,
                }),
            },
            {
              label: t("dreamToggle"),
              desc: t("dreamToggleDesc"),
              checked: settings.dreamEnabled,
              onChange: () =>
                updateMemorySettings({
                  dreamEnabled: !settings.dreamEnabled,
                }),
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-border dark:bg-muted/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-800 dark:text-foreground">
                    {item.label}
                  </div>
                  <div className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-muted-foreground">
                    {item.desc}
                  </div>
                </div>
                <SimpleSwitch
                  ariaLabel={item.label}
                  checked={item.checked}
                  onChange={item.onChange}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4 dark:border-border dark:bg-card">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-foreground">
              <Database size={16} className="text-cyan-500" aria-hidden />
              {t("status")}
            </div>
            <button
              type="button"
              onClick={handleDreamNow}
              disabled={
                dreamStatus.isRunning ||
                memories.length <= settings.targetCount ||
                !settings.enabled
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-medium text-cyan-700 transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-900/50 dark:bg-cyan-950/30 dark:text-cyan-200"
            >
              <Sparkles size={14} aria-hidden />
              {dreamStatus.isRunning ? t("dreaming") : t("dreamNow")}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-muted/40">
              <div className="text-xs text-gray-500 dark:text-muted-foreground">
                {t("memoryCount")}
              </div>
              <div className="mt-1 font-mono text-lg text-gray-900 dark:text-foreground">
                {memories.length}
              </div>
            </div>
            <div className="rounded-lg bg-gray-50 p-3 dark:bg-muted/40">
              <div className="text-xs text-gray-500 dark:text-muted-foreground">
                {t("dreamLimit")}
              </div>
              <div className="mt-1 font-mono text-lg text-gray-900 dark:text-foreground">
                {settings.triggerCount} / {settings.targetCount}
              </div>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-gray-500 dark:text-muted-foreground">
            {t("privacyNote")}
          </p>
          {(dreamError || dreamStatus.lastError) && (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-200"
            >
              {dreamError || dreamStatus.lastError}
            </p>
          )}

          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              handleSave();
            }}
            className="space-y-3 border-t border-gray-100 pt-4 dark:border-border"
          >
            <div className="text-sm font-semibold text-gray-800 dark:text-foreground">
              {editingId ? t("editMemory") : t("addMemory")}
            </div>
            <CustomSelect
              ariaLabel={t("typeLabel")}
              value={type}
              onChange={(value) => setType(value as MemoryType)}
              options={typeOptions}
            />
            <label htmlFor="memory-content" className="sr-only">
              {t("contentLabel")}
            </label>
            <textarea
              id="memory-content"
              value={content}
              onChange={(event) => {
                setContent(event.target.value);
                if (contentError) setContentError(null);
              }}
              maxLength={MEMORY_LIMITS.maxContentChars}
              placeholder={t("contentPlaceholder")}
              aria-invalid={!!contentError}
              aria-describedby={
                contentError ? "memory-content-error" : undefined
              }
              className="h-28 w-full resize-none rounded-lg border border-input bg-background p-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {contentError && (
              <p
                id="memory-content-error"
                role="alert"
                className="text-xs text-red-600 dark:text-red-300"
              >
                {contentError}
              </p>
            )}
            <label htmlFor="memory-tags" className="sr-only">
              {t("tagsLabel")}
            </label>
            <input
              id="memory-tags"
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder={t("tagsPlaceholder")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {editingId ? <Save size={16} /> : <Plus size={16} />}
                {editingId ? t("saveEdit") : t("add")}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex items-center justify-center rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 dark:border-border dark:text-muted-foreground dark:hover:bg-muted"
                  aria-label={t("cancelEdit")}
                >
                  <X size={16} aria-hidden />
                </button>
              )}
            </div>
          </form>
        </div>

        <div className="space-y-3">
          <label htmlFor="memory-filter" className="relative block">
            <span className="sr-only">{t("filterLabel")}</span>
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <input
              id="memory-filter"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("filterPlaceholder")}
              className="w-full rounded-xl border border-input bg-background py-2.5 pl-9 pr-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <div className="space-y-2">
            {filteredMemories.map((memory) => (
              <article
                key={memory.id}
                className="rounded-xl border border-gray-200 bg-white p-4 dark:border-border dark:bg-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-md bg-cyan-50 px-2 py-1 font-medium text-cyan-700 dark:bg-cyan-950/30 dark:text-cyan-200">
                        {t(
                          MEMORY_TYPE_OPTIONS.find(
                            (option) => option.value === memory.type,
                          )?.labelKey || "typeFact",
                        )}
                      </span>
                      <span className="text-gray-400">
                        {formatDate(memory.updatedAt, locale)}
                      </span>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800 dark:text-foreground">
                      {memory.content}
                    </p>
                    {memory.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {memory.tags.map((tag) => (
                          <span
                            key={tag}
                            className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600 dark:bg-muted dark:text-muted-foreground"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => handleEdit(memory)}
                      aria-label={t("editAria")}
                      className="inline-flex size-10 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-foreground"
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (pendingDeleteId !== memory.id) {
                          setPendingDeleteId(memory.id);
                          return;
                        }
                        removeMemory(memory.id);
                        setPendingDeleteId(null);
                      }}
                      aria-label={
                        pendingDeleteId === memory.id
                          ? t("confirmDeleteAria")
                          : t("deleteAria")
                      }
                      className={`inline-flex size-10 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 dark:hover:bg-red-950/20 ${
                        pendingDeleteId === memory.id
                          ? "bg-red-50 dark:bg-red-950/30"
                          : ""
                      }`}
                    >
                      {pendingDeleteId === memory.id ? (
                        <>
                          <Check size={15} aria-hidden />
                          <span className="sr-only">{t("confirmDelete")}</span>
                        </>
                      ) : (
                        <Trash2 size={15} aria-hidden />
                      )}
                    </button>
                  </div>
                </div>
              </article>
            ))}
            {filteredMemories.length === 0 && (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-border dark:text-muted-foreground">
                {query ? t("emptyFiltered") : t("empty")}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default MemorySettings;
