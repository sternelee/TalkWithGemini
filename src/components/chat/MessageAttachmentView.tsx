"use client";
import React, { useEffect, useState } from "react";
import { FileText, Library } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Attachment } from "@/types";
import { isOPFSUrl, resolveOPFSUrl } from "@/utils/opfs";
import { resolveObjectUrlWithLifecycle } from "@/lib/utils/objectUrlLifecycle";
import AudioPlayer from "./AudioPlayer";
import {
  isKnowledgeCollectionAttachment,
  isKnowledgeFileAttachment,
} from "@/lib/utils/knowledgeAttachments";

interface MessageAttachmentViewProps {
  attachment: Attachment;
  onImageClick: () => void;
}

const actionButtonFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background";

const MessageAttachmentView: React.FC<MessageAttachmentViewProps> = ({
  attachment,
  onImageClick,
}) => {
  const t = useTranslations("Message");
  const fallbackUrl =
    attachment.url ||
    (attachment.data
      ? `data:${attachment.mimeType};base64,${attachment.data}`
      : "");
  const [resolvedOpfsUrl, setResolvedOpfsUrl] = useState<{
    source: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!isOPFSUrl(attachment.url)) return;

    const source = attachment.url!;
    const resolution = resolveObjectUrlWithLifecycle({
      source,
      resolveObjectUrl: resolveOPFSUrl,
      onResolved: (url) => {
        setResolvedOpfsUrl(url ? { source, url } : null);
      },
      onError: () => setResolvedOpfsUrl(null),
    });
    return () => resolution.cancel();
  }, [attachment.url]);

  const resolvedUrl =
    attachment.url && isOPFSUrl(attachment.url)
      ? resolvedOpfsUrl?.source === attachment.url
        ? resolvedOpfsUrl.url
        : ""
      : fallbackUrl;

  if (
    isKnowledgeCollectionAttachment(attachment) ||
    isKnowledgeFileAttachment(attachment)
  ) {
    const isFile = isKnowledgeFileAttachment(attachment);
    return (
      <div className="group/attachment relative flex h-20 w-32 select-none flex-col justify-between overflow-hidden rounded-xl border border-purple-100 bg-purple-50/50 p-2.5 transition-colors hover:bg-purple-50 dark:border-purple-900/50 dark:bg-purple-900/20 dark:hover:bg-purple-900/30">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-purple-100 p-1.5 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300">
            {isFile ? (
              <FileText size={14} aria-hidden="true" />
            ) : (
              <Library size={14} aria-hidden="true" />
            )}
          </div>
          <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400 dark:text-purple-500">
            {isFile ? t("knowledgeFile") : t("knowledgeBase")}
          </span>
        </div>
        <span className="truncate text-xs font-semibold text-purple-900 dark:text-purple-100">
          {attachment.fileName}
        </span>
      </div>
    );
  }

  if (attachment.mimeType.startsWith("audio/")) {
    return (
      <div className="w-full max-w-sm">
        <AudioPlayer src={resolvedUrl} fileName={attachment.fileName} />
      </div>
    );
  }

  if (attachment.mimeType.startsWith("image/")) {
    return (
      <button
        type="button"
        className={`group/attachment relative cursor-pointer overflow-hidden rounded-lg border border-gray-200 bg-gray-50 shadow-sm transition-shadow hover:shadow-md dark:border-border dark:bg-muted ${actionButtonFocusClass}`}
        onClick={onImageClick}
        aria-label={t("previewImageAria", {
          fileName: attachment.fileName,
        })}
      >
        <img
          src={resolvedUrl}
          alt={attachment.fileName}
          width={256}
          height={128}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-32 w-auto rounded-lg object-cover transition-transform duration-300 group-hover/attachment:scale-110"
        />
      </button>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 shadow-sm dark:border-border dark:bg-muted">
      <div className="flex h-20 w-32 flex-col items-center justify-center p-2 text-gray-500 dark:text-muted-foreground">
        <FileText size={24} aria-hidden="true" />
        <span className="mt-1 w-full truncate text-center text-xs">
          {attachment.fileName}
        </span>
      </div>
    </div>
  );
};

export default MessageAttachmentView;
