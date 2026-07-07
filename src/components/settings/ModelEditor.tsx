"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Check,
  Copy,
  Image as ImageIcon,
  Paperclip,
  Eye,
  Mic,
  Lightbulb,
  Wrench,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useSettingsStore, formatModelName } from "@/store/core/settingsStore";
import Tooltip from "../ui/Tooltip";
import { ModelMetadata } from "@/types";
import { MODEL_METADATA_LIMITS } from "@/config/limits";
import { copyTextToClipboard } from "@/lib/utils/clipboard";
import { supportsImageGeneration, supportsModality } from "@/lib/utils/model";
import {
  createTimedStatusResetController,
  type TimedStatusResetController,
} from "@/lib/utils/timedStatus";
import AnchoredPortal from "@/components/ui/AnchoredPortal";

type CopyStatus = "idle" | "copied" | "error";

function withoutModalities(
  values: string[] | undefined,
  excluded: string[],
): string[] {
  const excludedSet = new Set(excluded.map((value) => value.toLowerCase()));
  return (values || []).filter(
    (value) => !excludedSet.has(value.trim().toLowerCase()),
  );
}

function dedupeModalities(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const CapabilityIconToggle = ({
  label,
  checked,
  onChange,
  icon: Icon,
  colorClass,
}: any) => {
  const t = useTranslations("ModelEditor");
  return (
    <Tooltip content={label} position="top">
      <button
        type="button"
        aria-label={
          checked
            ? t("toggleDisableAria", { label })
            : t("toggleEnableAria", { label })
        }
        aria-pressed={checked}
        onClick={() => onChange(!checked)}
        className={`p-2.5 rounded-xl border transition-[background-color,border-color,color,opacity] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background ${
          checked
            ? colorClass
            : "bg-gray-50 dark:bg-muted border-gray-200 dark:border-border text-gray-400 hover:bg-gray-100 dark:hover:bg-accent"
        }`}
      >
        <Icon size={14} aria-hidden="true" />
      </button>
    </Tooltip>
  );
};

const ModelEditor = ({
  modelId,
  onClose,
}: {
  modelId: string;
  onClose: () => void;
}) => {
  const t = useTranslations("ModelEditor");
  const { modelMetadata, customModelMetadata, setCustomModelMetadata } =
    useSettingsStore();

  // Initial State derived from existing metadata (custom priority > fetched)
  const initialMeta = customModelMetadata[modelId] ||
    modelMetadata[modelId] || { id: modelId, name: formatModelName(modelId) };

  const [name, setName] = useState(initialMeta.name || "");
  const [capabilities, setCapabilities] = useState({
    attachment: initialMeta.attachment || false,
    vision: supportsModality(initialMeta, "image", "input"),
    audio: supportsModality(initialMeta, "audio", "input"),
    image_generation: supportsImageGeneration(initialMeta),
    reasoning: initialMeta.reasoning || false,
    tool_call: initialMeta.tool_call || false,
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [idCopyStatus, setIdCopyStatus] = useState<CopyStatus>("idle");
  const [nameCopyStatus, setNameCopyStatus] = useState<CopyStatus>("idle");
  const nameFieldRef = useRef<HTMLDivElement>(null);
  const idCopyStatusReset = useMemo(
    () =>
      createTimedStatusResetController<CopyStatus>({
        setStatus: setIdCopyStatus,
        resetValue: "idle",
      }),
    [],
  );
  const nameCopyStatusReset = useMemo(
    () =>
      createTimedStatusResetController<CopyStatus>({
        setStatus: setNameCopyStatus,
        resetValue: "idle",
      }),
    [],
  );

  // Suggestions for auto-complete based on fetched modelMetadata names
  const suggestions = useMemo(() => {
    if (!name) return [];
    const lowerName = name.toLowerCase();
    return (Object.values(modelMetadata) as ModelMetadata[])
      .filter(
        (m) =>
          m.name && m.name.toLowerCase().includes(lowerName) && m.name !== name,
      )
      .slice(0, 5); // Limit to 5
  }, [name, modelMetadata]);

  const handleSave = () => {
    const inputModalities = dedupeModalities([
      ...withoutModalities(initialMeta.modalities?.input, [
        "image",
        "audio",
        "text",
      ]),
      ...(capabilities.vision ? ["image"] : []),
      ...(capabilities.audio ? ["audio"] : []),
      "text",
    ]);
    const outputModalities = dedupeModalities([
      ...withoutModalities(initialMeta.modalities?.output, ["image"]),
      ...(capabilities.image_generation ? ["image"] : []),
    ]);
    const newMeta: ModelMetadata = {
      ...initialMeta,
      id: modelId,
      name: name,
      attachment: capabilities.attachment,
      reasoning: capabilities.reasoning,
      tool_call: capabilities.tool_call,
      modalities: {
        ...initialMeta.modalities,
        input: inputModalities,
        output: outputModalities.length > 0 ? outputModalities : undefined,
      },
    };
    setCustomModelMetadata(modelId, newMeta);
    onClose();
  };

  const selectSuggestion = (suggestion: ModelMetadata) => {
    setName(suggestion.name);
    setCapabilities({
      attachment: suggestion.attachment || false,
      vision: supportsModality(suggestion, "image", "input"),
      audio: supportsModality(suggestion, "audio", "input"),
      image_generation: supportsImageGeneration(suggestion),
      reasoning: suggestion.reasoning || false,
      tool_call: suggestion.tool_call || false,
    });
    setShowSuggestions(false);
  };

  useEffect(() => {
    return () => {
      idCopyStatusReset.dispose();
      nameCopyStatusReset.dispose();
    };
  }, [idCopyStatusReset, nameCopyStatusReset]);

  const copyToClipboard = async (
    text: string,
    controller: TimedStatusResetController<CopyStatus>,
  ) => {
    const copied = await copyTextToClipboard(text);
    controller.set(copied ? "copied" : "error");
  };

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/5 dark:bg-black/50 backdrop-blur-[2px] animate-in fade-in duration-200">
      <div className="bg-white dark:bg-card w-full max-w-sm rounded-2xl shadow-2xl border border-gray-200 dark:border-border flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-border bg-gray-50/50 dark:bg-muted/50">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-foreground">
            {t("editModel")}
          </h3>
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="p-1 hover:bg-gray-200 dark:hover:bg-accent rounded-full transition-colors text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* ID Field */}
          <div className="space-y-1.5">
            <label
              htmlFor="model-editor-id"
              className="text-[10px] font-bold text-gray-400 uppercase tracking-wider"
            >
              {t("modelId")}
            </label>
            <div className="relative" ref={nameFieldRef}>
              <input
                id="model-editor-id"
                type="text"
                name="model-id"
                readOnly
                value={modelId}
                className="w-full bg-gray-50 dark:bg-muted border border-gray-200 dark:border-border rounded-xl pl-3 pr-9 py-2.5 text-xs font-mono text-gray-600 dark:text-foreground/85 break-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              />
              <button
                type="button"
                aria-label={
                  idCopyStatus === "copied"
                    ? t("idCopied")
                    : idCopyStatus === "error"
                      ? t("idCopyFailed")
                      : t("copyId")
                }
                onClick={() => copyToClipboard(modelId, idCopyStatusReset)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-foreground/85 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background"
              >
                {idCopyStatus === "copied" ? (
                  <Check
                    size={14}
                    className="text-green-500"
                    aria-hidden="true"
                  />
                ) : idCopyStatus === "error" ? (
                  <X size={14} className="text-red-500" aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {/* Name Field */}
          <div className="space-y-1.5 relative">
            <label
              htmlFor="model-editor-name"
              className="text-[10px] font-bold text-gray-400 uppercase tracking-wider"
            >
              {t("modelName")}
            </label>
            <div className="relative" ref={nameFieldRef}>
              <input
                id="model-editor-name"
                type="text"
                name="model-name"
                autoComplete="off"
                value={name}
                maxLength={MODEL_METADATA_LIMITS.maxNameChars}
                onChange={(e) => {
                  setName(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                className="w-full bg-white dark:bg-card border border-gray-200 dark:border-border rounded-xl pl-3 pr-9 py-2.5 text-sm text-gray-800 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-[background-color,border-color,box-shadow,color]"
              />
              <button
                type="button"
                aria-label={
                  nameCopyStatus === "copied"
                    ? t("nameCopied")
                    : nameCopyStatus === "error"
                      ? t("nameCopyFailed")
                      : t("copyName")
                }
                onClick={() => copyToClipboard(name, nameCopyStatusReset)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-foreground/85 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background"
              >
                {nameCopyStatus === "copied" ? (
                  <Check
                    size={14}
                    className="text-green-500"
                    aria-hidden="true"
                  />
                ) : nameCopyStatus === "error" ? (
                  <X size={14} className="text-red-500" aria-hidden="true" />
                ) : (
                  <Copy size={14} aria-hidden="true" />
                )}
              </button>
            </div>

            {/* Auto-complete Dropdown */}
            <AnchoredPortal
              anchorRef={nameFieldRef}
              open={showSuggestions && suggestions.length > 0}
              onClose={() => setShowSuggestions(false)}
              role="listbox"
              ariaLabel={t("closeSuggestions")}
              placement="bottom-start"
              matchAnchorWidth
              maxHeight={160}
              className="bg-white dark:bg-muted border border-gray-200 dark:border-border rounded-xl shadow-xl z-50 overflow-y-auto custom-scrollbar"
            >
              {suggestions.map((s) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  key={s.id}
                  onClick={() => selectSuggestion(s)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-foreground transition-colors flex justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-inset"
                >
                  <span className="truncate flex-1">{s.name}</span>
                </button>
              ))}
            </AnchoredPortal>
          </div>

          {/* Capabilities */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
              {t("capabilities")}
            </label>
            <div className="flex flex-wrap gap-2">
              <CapabilityIconToggle
                label={t("capAttachment")}
                icon={Paperclip}
                checked={capabilities.attachment}
                onChange={(v: boolean) =>
                  setCapabilities({ ...capabilities, attachment: v })
                }
                colorClass="bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-300"
              />
              <CapabilityIconToggle
                label={t("capVision")}
                icon={Eye}
                checked={capabilities.vision}
                onChange={(v: boolean) =>
                  setCapabilities({ ...capabilities, vision: v })
                }
                colorClass="bg-green-50 border-green-200 text-green-600 dark:bg-green-900/20 dark:border-green-800 dark:text-green-300"
              />
              <CapabilityIconToggle
                label={t("capImageGeneration")}
                icon={ImageIcon}
                checked={capabilities.image_generation}
                onChange={(v: boolean) =>
                  setCapabilities({ ...capabilities, image_generation: v })
                }
                colorClass="bg-cyan-50 border-cyan-200 text-cyan-600 dark:bg-cyan-900/20 dark:border-cyan-800 dark:text-cyan-300"
              />
              <CapabilityIconToggle
                label={t("capAudio")}
                icon={Mic}
                checked={capabilities.audio}
                onChange={(v: boolean) =>
                  setCapabilities({ ...capabilities, audio: v })
                }
                colorClass="bg-orange-50 border-orange-200 text-orange-600 dark:bg-orange-900/20 dark:border-orange-800 dark:text-orange-300"
              />
              <CapabilityIconToggle
                label={t("capReasoning")}
                icon={Lightbulb}
                checked={capabilities.reasoning}
                onChange={(v: boolean) =>
                  setCapabilities({ ...capabilities, reasoning: v })
                }
                colorClass="bg-violet-50 border-violet-200 text-violet-600 dark:bg-violet-900/20 dark:border-violet-800 dark:text-violet-300"
              />
              <CapabilityIconToggle
                label={t("capToolCall")}
                icon={Wrench}
                checked={capabilities.tool_call}
                onChange={(v: boolean) =>
                  setCapabilities({ ...capabilities, tool_call: v })
                }
                colorClass="bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300"
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 dark:border-border bg-gray-50/50 dark:bg-muted/50">
          <button
            type="button"
            onClick={handleSave}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors shadow-lg shadow-blue-500/20 text-sm"
          >
            {t("saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModelEditor;
