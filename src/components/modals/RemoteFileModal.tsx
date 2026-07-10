"use client";
import React, { useState, useEffect, useRef, useMemo, useId } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { X, Link, Check, ChevronDown, AlertTriangle } from "lucide-react";
import { Attachment } from "@/types";
import { v7 as uuidv7 } from "uuid";
import { getRemoteAttachmentUrlError } from "@/lib/security/remoteAttachment";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  trapModalFocus,
  useModalLifecycle,
} from "@/components/ui/useModalLifecycle";

interface RemoteFileModalProps {
  onClose: () => void;
  onAttach: (attachment: Attachment) => void;
  capabilities: {
    vision: boolean;
    audio: boolean;
    attachment: boolean;
  };
}

type FileType = "image" | "audio" | "text";

const TEXT_EXTS = [
  "txt",
  "md",
  "markdown",
  "html",
  "htm",
  "css",
  "js",
  "ts",
  "json",
  "xml",
  "yaml",
  "yml",
  "csv",
  "log",
  "ini",
  "conf",
  "sh",
  "bash",
  "py",
  "rb",
  "php",
  "java",
  "c",
  "cpp",
  "h",
  "sql",
  "vue",
  "jsx",
  "tsx",
  "svelte",
  "go",
  "rs",
  "swift",
];

const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
const AUDIO_EXTS = ["mp3", "wav", "ogg", "flac", "mp4", "webm"];

const RemoteFileModal: React.FC<RemoteFileModalProps> = ({
  onClose,
  onAttach,
  capabilities,
}) => {
  const t = useTranslations("RemoteFile");
  const typeLabel = (type: FileType) =>
    type === "image"
      ? t("typeImage")
      : type === "audio"
        ? t("typeAudio")
        : t("typeText");
  const [url, setUrl] = useState("");
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);
  const [shouldAutoFocus, setShouldAutoFocus] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const urlInputId = useId();
  const urlMessageId = useId();

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Compute available types based on capabilities
  const availableTypes = useMemo(() => {
    const types: FileType[] = [];
    // Prefer order: Text -> Image -> Audio (or logically relevant)
    if (capabilities.attachment) types.push("text");
    if (capabilities.vision) types.push("image");
    if (capabilities.audio) types.push("audio");
    return types;
  }, [capabilities]);

  const [selectedType, setSelectedType] = useState<FileType>(
    availableTypes[0] || "text",
  );

  // Update selected type if availableTypes changes and current selection is invalid
  useEffect(() => {
    if (availableTypes.length > 0 && !availableTypes.includes(selectedType)) {
      // Use queueMicrotask to defer state update
      queueMicrotask(() => {
        if (!isMountedRef.current) return;
        setSelectedType(availableTypes[0]);
      });
    }
  }, [availableTypes, selectedType]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const syncAutoFocus = () => setShouldAutoFocus(media.matches);
    syncAutoFocus();
    media.addEventListener("change", syncAutoFocus);
    return () => media.removeEventListener("change", syncAutoFocus);
  }, []);

  useModalLifecycle({
    open: true,
    dialogRef,
    initialFocusRef: shouldAutoFocus ? inputRef : undefined,
  });

  // Validation Logic
  const urlError = useMemo(() => {
    if (!url.trim()) return null;
    return getRemoteAttachmentUrlError(url);
  }, [url]);

  const warningMessage = useMemo(() => {
    if (!url.trim()) return null;
    if (urlError) return null;

    try {
      // Basic URL validation
      new URL(url);
      const path = url.split("?")[0].split("#")[0];
      const ext = path.split(".").pop()?.toLowerCase();

      if (!ext || ext.length > 5 || ext.includes("/")) {
        // No extension detected or seemingly invalid, might rely on Content-Type header which we can't check here easily
        // We can show a mild warning or just let it slide?
        // Requirement says: "if not ... show warning".
        return t("warnNoExtension");
      }

      let valid = false;
      if (selectedType === "text") valid = TEXT_EXTS.includes(ext);
      else if (selectedType === "image") valid = IMAGE_EXTS.includes(ext);
      else if (selectedType === "audio") valid = AUDIO_EXTS.includes(ext);

      if (!valid) {
        const typeName =
          selectedType === "image"
            ? t("typeImage")
            : selectedType === "audio"
              ? t("typeAudio")
              : t("typeText");
        return t("warnUnsupported", { type: typeName });
      }
    } catch {
      return t("invalidUrl");
    }
    return null;
  }, [url, selectedType, urlError, t]);

  const urlPlaceholder =
    selectedType === "image"
      ? t("placeholderImage")
      : selectedType === "audio"
        ? t("placeholderAudio")
        : t("placeholderText");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!url.trim()) return;
    if (urlError) return;

    let mimeType = "text/plain";

    if (selectedType === "image") mimeType = "image/jpeg";
    else if (selectedType === "audio") mimeType = "audio/mpeg";
    else mimeType = "text/plain";

    const attachment: Attachment = {
      id: uuidv7(),
      url: new URL(url.trim()).toString(),
      mimeType: mimeType,
      fileName: url.split("/").pop()?.split("?")[0] || "remote-file",
    };

    onAttach(attachment);
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex items-center justify-center overflow-y-auto overscroll-contain bg-black/20 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm animate-in fade-in duration-200 dark:bg-black/60"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="remote-file-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            onClose();
            return;
          }
          trapModalFocus(event, dialogRef.current);
        }}
        className="glass-popover flex max-h-[calc(100dvh-2rem)] w-full max-w-md scale-100 flex-col overflow-hidden overscroll-contain rounded-2xl border transform transition-transform duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200/50 dark:border-border">
          <h3
            id="remote-file-title"
            className="text-lg font-bold text-gray-800 dark:text-foreground flex items-center gap-2"
          >
            <Link size={20} className="text-blue-500" aria-hidden="true" />{" "}
            {t("title")}
          </h3>
          <button
            type="button"
            aria-label={t("close")}
            onClick={onClose}
            className="p-1.5 hover:bg-gray-200/50 dark:hover:bg-accent/50 rounded-full transition-colors text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-5">
            {/* Input Group */}
            <div className="space-y-1.5 relative z-10">
              <label
                htmlFor={urlInputId}
                className="text-xs font-semibold text-gray-500 dark:text-muted-foreground uppercase tracking-wider ml-1"
              >
                {t("fileUrl")}
              </label>

              <div className="flex items-center w-full bg-white dark:bg-muted/50 border border-gray-200 dark:border-border rounded-xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500 transition-[border-color,box-shadow] text-sm">
                {/* Type Selector Trigger */}
                <div className="relative">
                  <DropdownMenu
                    open={showTypeDropdown && availableTypes.length > 1}
                    onOpenChange={(open) =>
                      setShowTypeDropdown(open && availableTypes.length > 1)
                    }
                  >
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label={t("fileTypeAria", {
                          type: typeLabel(selectedType),
                        })}
                        disabled={availableTypes.length <= 1}
                        className={`flex items-center gap-1.5 px-3 py-3 font-medium rounded-l-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 ${availableTypes.length > 1 ? "text-gray-700 dark:text-foreground" : "text-gray-500 dark:text-muted-foreground cursor-default"}`}
                      >
                        <span className="text-xs">
                          {typeLabel(selectedType)}
                        </span>
                        {availableTypes.length > 1 && (
                          <ChevronDown
                            size={12}
                            aria-hidden="true"
                            className={`text-gray-400 transition-transform ${showTypeDropdown ? "rotate-180" : ""}`}
                          />
                        )}
                      </button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent
                      side="bottom"
                      align="start"
                      className="w-28"
                      aria-label={t("typeMenuLabel")}
                    >
                      <DropdownMenuRadioGroup
                        value={selectedType}
                        onValueChange={(type) => {
                          setSelectedType(type as FileType);
                          setShowTypeDropdown(false);
                        }}
                      >
                        {availableTypes.map((type) => (
                          <DropdownMenuRadioItem key={type} value={type}>
                            {typeLabel(type)}
                          </DropdownMenuRadioItem>
                        ))}
                      </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="w-px h-5 bg-gray-200 dark:border-border dark:bg-accent" />

                <input
                  id={urlInputId}
                  ref={inputRef}
                  name="remoteFileUrl"
                  type="url"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={urlPlaceholder}
                  aria-invalid={!!urlError}
                  aria-describedby={
                    urlError || warningMessage ? urlMessageId : undefined
                  }
                  className="flex-1 px-3 py-3 bg-transparent border-none focus:outline-none focus:ring-0 text-sm placeholder-gray-400 text-gray-800 dark:text-foreground w-full"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Warning / Error Message */}
            {(urlError || warningMessage) && (
              <div
                id={urlMessageId}
                role={urlError ? "alert" : "status"}
                aria-live="polite"
                className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs animate-in fade-in slide-in-from-top-1 ${
                  urlError
                    ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                    : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
                }`}
              >
                <AlertTriangle
                  size={14}
                  className="shrink-0 mt-0.5"
                  aria-hidden="true"
                />
                <span>{urlError || warningMessage}</span>
              </div>
            )}
          </div>

          <div className="p-5 border-t border-gray-200/50 dark:border-border bg-gray-50/50 dark:bg-card/50 flex justify-end gap-3 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-muted-foreground hover:bg-white dark:hover:bg-muted rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              {t("cancel")}
            </button>
            <button
              type="submit"
              disabled={!url.trim() || !!urlError}
              className="px-6 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60"
            >
              <Check size={16} aria-hidden="true" /> {t("attach")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
};

export default RemoteFileModal;
