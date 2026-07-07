"use client";

import React, { useMemo } from "react";
import { ImageOff } from "lucide-react";
import type { Attachment, Message, MessageOutputBlock, Source } from "@/types";
import { getMessageOutputBlocks } from "@/lib/chat/messageOutputBlocks";
import type { MarkdownGeneratedFile } from "@/lib/utils/markdownFiles";
import { useUIStore } from "@/store/core/uiStore";
import { useAttachmentDisplayUrl } from "@/lib/utils/useAttachmentDisplayUrl";
import MarkdownRenderer, {
  type MarkdownRendererProps,
} from "./MarkdownRenderer";
import ReasoningBlock from "./ReasoningBlock";
import SourceBlock from "./SourceBlock";
import ToolCallBlock from "./ToolCallBlock";
import MemorySearchBlock from "./MemorySearchBlock";
import SafeImage from "../ui/SafeImage";

interface MessageOutputRendererProps {
  message: Message;
  displayedContent: string;
  isTyping?: boolean;
  isThinking?: boolean;
  isErrorMessage?: boolean;
  searchSources: Source[];
  onFileClick?: (file: MarkdownGeneratedFile) => void;
  forcedTheme?: MarkdownRendererProps["forcedTheme"];
  forceExpandCodeBlocks?: boolean;
  onImageCached?: (image: Attachment) => void;
}

const isMemorySearchTool = (name: string | undefined) =>
  name === "memory_search";

const GeneratedImageBlock: React.FC<{
  image: Attachment;
  onImageCached?: (image: Attachment) => void;
}> = ({ image, onImageCached }) => {
  const openImagePreview = useUIStore((state) => state.openImagePreview);
  const src = useAttachmentDisplayUrl(image, {
    enableCacheBackfill: true,
    onCacheReady: onImageCached,
  });
  const canPreview = Boolean(src);

  return (
    <button
      type="button"
      disabled={!canPreview}
      onClick={() => {
        if (!src) return;
        openImagePreview(
          [
            {
              url: src,
              alt: image.fileName,
              description: image.fileName,
            },
          ],
          0,
        );
      }}
      className="my-3 block max-w-full overflow-hidden rounded-lg border border-border bg-muted/30 text-left shadow-sm transition-shadow enabled:cursor-pointer enabled:hover:shadow-md disabled:cursor-default"
      aria-label={image.fileName}
    >
      <SafeImage
        src={src}
        alt={image.fileName}
        className="max-h-[70vh] max-w-full object-contain"
        fallback={
          <div className="flex h-40 w-72 max-w-full items-center justify-center text-muted-foreground">
            <ImageOff size={24} aria-hidden="true" />
          </div>
        }
      />
    </button>
  );
};

function trimTextBlocksForStreaming(
  blocks: MessageOutputBlock[],
  displayedContent: string,
  isStreaming: boolean,
): MessageOutputBlock[] {
  if (!isStreaming) return blocks;

  const fullText = blocks
    .filter((block) => block.type === "text")
    .map((block) => block.content)
    .join("");
  if (displayedContent === fullText) return blocks;

  let remaining = displayedContent;
  return blocks
    .map((block) => {
      if (block.type !== "text") return block;
      const content = remaining.slice(0, block.content.length);
      remaining = remaining.slice(content.length);
      return { ...block, content };
    })
    .filter((block) => block.type !== "text" || block.content.length > 0);
}

const MessageOutputRenderer: React.FC<MessageOutputRendererProps> = ({
  message,
  displayedContent,
  isTyping = false,
  isThinking = false,
  isErrorMessage = false,
  searchSources,
  onFileClick,
  forcedTheme,
  forceExpandCodeBlocks,
  onImageCached,
}) => {
  const blocks = useMemo(() => {
    const orderedBlocks = getMessageOutputBlocks(message);
    return trimTextBlocksForStreaming(
      orderedBlocks,
      displayedContent,
      isTyping,
    );
  }, [displayedContent, isTyping, message]);

  if (blocks.length === 0) return null;

  return (
    <div className={isTyping ? "animate-in fade-in duration-500" : ""}>
      {blocks.map((block, index) => {
        switch (block.type) {
          case "text":
            return (
              <MarkdownRenderer
                key={block.id}
                content={block.content}
                className={isErrorMessage ? "text-red-500" : undefined}
                searchSources={searchSources}
                onFileClick={onFileClick}
                isStreaming={isTyping}
                forcedTheme={forcedTheme}
                forceExpandCodeBlocks={forceExpandCodeBlocks}
              />
            );
          case "reasoning":
            return (
              <ReasoningBlock
                key={block.id}
                reasoning={block.content}
                isThinking={isThinking && index === blocks.length - 1}
                durationMs={block.durationMs}
              />
            );
          case "search":
            return (
              <SourceBlock
                key={block.id}
                sources={block.sources}
                images={block.images}
                isSearching={block.isSearching}
                error={block.error}
              />
            );
          case "image":
            return (
              <GeneratedImageBlock
                key={block.id}
                image={block.image}
                onImageCached={onImageCached}
              />
            );
          case "tool_group": {
            const memoryToolCalls = block.toolCalls.filter((toolCall) =>
              isMemorySearchTool(toolCall.name),
            );
            const otherToolCalls = block.toolCalls.filter(
              (toolCall) => !isMemorySearchTool(toolCall.name),
            );

            return (
              <React.Fragment key={block.id}>
                {memoryToolCalls.length > 0 ? (
                  <MemorySearchBlock toolCalls={memoryToolCalls} />
                ) : null}
                {otherToolCalls.length > 0 ? (
                  <ToolCallBlock toolCalls={otherToolCalls} />
                ) : null}
              </React.Fragment>
            );
          }
        }
      })}
    </div>
  );
};

export default MessageOutputRenderer;
