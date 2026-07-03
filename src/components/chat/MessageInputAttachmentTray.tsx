"use client";
import React, { useEffect, useState } from "react";
import { FileAudio, FileText, Library, Link, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Attachment } from "@/types";
import { isOPFSUrl, resolveOPFSUrl } from "@/utils/opfs";
import { resolveObjectUrlWithLifecycle } from "@/lib/utils/objectUrlLifecycle";
import {
  isKnowledgeCollectionAttachment,
  isKnowledgeFileAttachment,
} from "@/lib/utils/knowledgeAttachments";

interface MessageInputAttachmentTrayProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
  ariaLabel: string;
}

const iconButtonFocusClass =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-background";

const AttachmentPreviewCard: React.FC<{
  attachment: Attachment;
  onRemove: (id: string) => void;
}> = ({ attachment, onRemove }) => {
  const t = useTranslations("MessageInput");
  const fallbackSrc =
    attachment.url ||
    (attachment.data
      ? `data:${attachment.mimeType};base64,${attachment.data}`
      : "");
  const [resolvedOpfsSrc, setResolvedOpfsSrc] = useState<{
    source: string;
    url: string;
  } | null>(null);

  useEffect(() => {
    if (!attachment.url || !isOPFSUrl(attachment.url)) return;

    const source = attachment.url;
    const resolution = resolveObjectUrlWithLifecycle({
      source,
      resolveObjectUrl: resolveOPFSUrl,
      onResolved: (url) => {
        setResolvedOpfsSrc(url ? { source, url } : null);
      },
      onError: () => setResolvedOpfsSrc(null),
    });
    return () => resolution.cancel();
  }, [attachment.url]);

  const resolvedSrc =
    attachment.url && isOPFSUrl(attachment.url)
      ? resolvedOpfsSrc?.source === attachment.url
        ? resolvedOpfsSrc.url
        : ""
      : fallbackSrc;

  const renderIcon = () => {
    if (isKnowledgeCollectionAttachment(attachment)) {
      return (
        <Library size={20} className="text-purple-500" aria-hidden="true" />
      );
    }

    if (isKnowledgeFileAttachment(attachment)) {
      return (
        <FileText size={20} className="text-purple-500" aria-hidden="true" />
      );
    }

    if (attachment.mimeType.startsWith("image/") && resolvedSrc) {
      return (
        <img
          src={resolvedSrc}
          alt={attachment.fileName}
          width={64}
          height={64}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      );
    }

    if (attachment.mimeType.startsWith("audio/")) {
      return <FileAudio size={20} aria-hidden="true" />;
    }
    if (attachment.url && !isOPFSUrl(attachment.url)) {
      return <Link size={20} aria-hidden="true" />;
    }
    return <FileText size={20} aria-hidden="true" />;
  };

  return (
    <li className="group relative h-16 w-16 shrink-0 select-none overflow-hidden rounded-lg border border-gray-400/80 bg-white/50 dark:border-input dark:bg-accent">
      <div className="flex h-full w-full flex-col items-center justify-center text-gray-500 dark:text-foreground/85">
        {renderIcon()}
        {!attachment.mimeType.startsWith("image/") && (
          <span className="mt-1 w-full truncate px-1 text-center text-[8px]">
            {attachment.fileName}
          </span>
        )}
        {attachment.url &&
          !isOPFSUrl(attachment.url) &&
          !attachment.mimeType.startsWith("image/") && (
            <div
              className="absolute bottom-0 right-0 rounded-tl bg-blue-500 p-0.5 text-white"
              aria-hidden="true"
            >
              <Link size={8} aria-hidden="true" />
            </div>
          )}
      </div>
      <button
        type="button"
        aria-label={t("removeAttachment", {
          fileName: attachment.fileName,
        })}
        onClick={() => onRemove(attachment.id)}
        className={`absolute right-0.5 top-0.5 z-10 rounded-full bg-black/50 p-0.5 text-white transition-colors hover:bg-red-500 ${iconButtonFocusClass}`}
      >
        <X size={10} aria-hidden="true" />
      </button>
    </li>
  );
};

const MessageInputAttachmentTray: React.FC<MessageInputAttachmentTrayProps> = ({
  attachments,
  onRemove,
  ariaLabel,
}) => {
  if (attachments.length === 0) return null;

  return (
    <ul
      className="custom-scrollbar flex gap-2 overflow-x-auto border-b border-white/30 p-3 dark:border-border"
      aria-label={ariaLabel}
    >
      {attachments.map((attachment) => (
        <AttachmentPreviewCard
          key={attachment.id}
          attachment={attachment}
          onRemove={onRemove}
        />
      ))}
    </ul>
  );
};

export default MessageInputAttachmentTray;
