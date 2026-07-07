"use client";

import React, { useMemo } from "react";
import type { Message, MessageOutputBlock, Source } from "@/types";
import { getMessageOutputBlocks } from "@/lib/chat/messageOutputBlocks";
import type { MarkdownGeneratedFile } from "@/lib/utils/markdownFiles";
import MarkdownRenderer from "./MarkdownRenderer";
import ReasoningBlock from "./ReasoningBlock";
import SourceBlock from "./SourceBlock";
import ToolCallBlock from "./ToolCallBlock";
import MemorySearchBlock from "./MemorySearchBlock";

interface MessageOutputRendererProps {
  message: Message;
  displayedContent: string;
  isTyping?: boolean;
  isThinking?: boolean;
  isErrorMessage?: boolean;
  searchSources: Source[];
  onFileClick?: (file: MarkdownGeneratedFile) => void;
}

const isMemorySearchTool = (name: string | undefined) =>
  name === "memory_search";

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
