import { v7 as uuidv7 } from "uuid";
import type {
  ImageSource,
  Message,
  MessageOutputBlock,
  Source,
  ToolCall,
} from "../../types";

export interface MessageOutputBlockBuilderOptions {
  createId?: () => string;
  initialBlocks?: MessageOutputBlock[];
}

interface SearchBlockUpdate {
  isSearching?: boolean;
  error?: string;
  results?: {
    sources?: Source[];
    images?: ImageSource[];
  };
}

const cloneToolCall = (toolCall: ToolCall): ToolCall => ({ ...toolCall });

const cloneImage = (
  image: Extract<MessageOutputBlock, { type: "image" }>["image"],
) => ({ ...image });

const cloneBlock = (block: MessageOutputBlock): MessageOutputBlock => {
  switch (block.type) {
    case "text":
      return { ...block };
    case "reasoning":
      return { ...block };
    case "search":
      return {
        ...block,
        error: block.error,
        sources: [...block.sources],
        images: [...block.images],
      };
    case "image":
      return {
        ...block,
        image: cloneImage(block.image),
      };
    case "image_generation_status":
      return { ...block };
    case "tool_group":
      return {
        ...block,
        toolCalls: block.toolCalls.map(cloneToolCall),
      };
  }
};

export function createMessageOutputBlockBuilder(
  options: MessageOutputBlockBuilderOptions = {},
) {
  const createId = options.createId ?? (() => uuidv7());
  const blocks = (options.initialBlocks || []).map(cloneBlock);
  let activeSearchBlockId: string | undefined;
  let activeReasoningBlockId: string | undefined;
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.type === "search" && block.isSearching) {
      activeSearchBlockId = block.id;
      break;
    }
  }
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.type === "reasoning" && block.startedAt && !block.endedAt) {
      activeReasoningBlockId = block.id;
      break;
    }
  }

  const getLastBlock = () => blocks[blocks.length - 1];

  const finalizeActiveReasoning = (endedAt = Date.now()) => {
    if (!activeReasoningBlockId) return false;
    const block = blocks.find(
      (item): item is Extract<MessageOutputBlock, { type: "reasoning" }> =>
        item.type === "reasoning" && item.id === activeReasoningBlockId,
    );
    activeReasoningBlockId = undefined;
    if (!block || block.endedAt) return false;
    const startedAt = block.startedAt ?? endedAt;
    block.startedAt = startedAt;
    block.endedAt = endedAt;
    block.durationMs = Math.max(0, endedAt - startedAt);
    return true;
  };

  const findToolCallLocation = (toolCallId: string) => {
    for (const block of blocks) {
      if (block.type !== "tool_group") continue;
      const index = block.toolCalls.findIndex((tc) => tc.id === toolCallId);
      if (index !== -1) return { block, index };
    }
    return null;
  };

  const updateToolCallInGroup = (
    block: Extract<MessageOutputBlock, { type: "tool_group" }>,
    toolCall: ToolCall,
  ) => {
    const index = block.toolCalls.findIndex((tc) => tc.id === toolCall.id);
    if (index === -1) {
      block.toolCalls.push(cloneToolCall(toolCall));
      return;
    }
    block.toolCalls[index] = {
      ...block.toolCalls[index],
      ...toolCall,
    };
  };

  return {
    appendText(content: string) {
      if (!content) return;
      finalizeActiveReasoning();
      const last = getLastBlock();
      if (last?.type === "text") {
        last.content += content;
        return;
      }
      blocks.push({
        id: createId(),
        type: "text",
        content,
      });
    },

    appendReasoning(content: string) {
      if (!content) return;
      const last = getLastBlock();
      if (last?.type === "reasoning" && !last.endedAt) {
        if (!last.startedAt) {
          last.startedAt = Date.now();
        }
        last.content += content;
        activeReasoningBlockId = last.id;
        return;
      }
      const startedAt = Date.now();
      blocks.push({
        id: createId(),
        type: "reasoning",
        content,
        startedAt,
      });
      activeReasoningBlockId = blocks[blocks.length - 1]?.id;
    },

    upsertSearch(update: SearchBlockUpdate) {
      finalizeActiveReasoning();
      const activeTarget = activeSearchBlockId
        ? blocks.find(
            (block) =>
              block.type === "search" && block.id === activeSearchBlockId,
          )
        : undefined;
      const lastBlock = getLastBlock();
      const target:
        Extract<MessageOutputBlock, { type: "search" }> | undefined =
        activeTarget?.type === "search"
          ? activeTarget
          : lastBlock?.type === "search"
            ? lastBlock
            : undefined;

      const sources = update.results?.sources || [];
      const images = update.results?.images || [];
      const isSearching = update.isSearching ?? target?.isSearching ?? false;
      const error = update.error;

      if (target?.type === "search") {
        target.isSearching = isSearching;
        target.error = error;
        if (update.results) {
          target.sources = sources;
          target.images = images;
        }
        activeSearchBlockId = isSearching ? target.id : undefined;
        return;
      }

      const block: MessageOutputBlock = {
        id: createId(),
        type: "search",
        isSearching,
        ...(error ? { error } : {}),
        sources,
        images,
      };
      blocks.push(block);
      activeSearchBlockId = isSearching ? block.id : undefined;
    },

    appendImage(
      image: Extract<MessageOutputBlock, { type: "image" }>["image"],
    ) {
      finalizeActiveReasoning();
      blocks.push({
        id: createId(),
        type: "image",
        image: cloneImage(image),
      });
    },

    appendImageGenerationStatus() {
      finalizeActiveReasoning();
      const id = createId();
      blocks.push({
        id,
        type: "image_generation_status",
        status: "generating",
      });
      return id;
    },

    clearImageGenerationStatus(id?: string) {
      const index = blocks.findIndex(
        (block) =>
          block.type === "image_generation_status" && (!id || block.id === id),
      );
      if (index === -1) return false;
      blocks.splice(index, 1);
      return true;
    },

    appendToolCall(toolCall: ToolCall) {
      finalizeActiveReasoning();
      const last = getLastBlock();
      if (last?.type === "tool_group") {
        updateToolCallInGroup(last, toolCall);
        return;
      }

      blocks.push({
        id: createId(),
        type: "tool_group",
        toolCalls: [cloneToolCall(toolCall)],
      });
    },

    updateToolCall(toolCall: ToolCall) {
      const location = findToolCallLocation(toolCall.id);
      if (location) {
        updateToolCallInGroup(location.block, toolCall);
        return;
      }
      const last = getLastBlock();
      if (last?.type === "tool_group") {
        updateToolCallInGroup(last, toolCall);
        return;
      }
      blocks.push({
        id: createId(),
        type: "tool_group",
        toolCalls: [cloneToolCall(toolCall)],
      });
    },

    getBlocks(): MessageOutputBlock[] {
      return blocks.map(cloneBlock);
    },

    finalizeActiveReasoning,
  };
}

export function getMessageOutputBlocks(message: Message): MessageOutputBlock[] {
  if (message.outputBlocks?.length) {
    return message.outputBlocks.map(cloneBlock);
  }

  const blocks: MessageOutputBlock[] = [];
  const sources = message.searchSources || [];
  const images = message.searchImages || [];

  if (message.isSearching || sources.length > 0 || images.length > 0) {
    blocks.push({
      id: `${message.id}-legacy-search`,
      type: "search",
      isSearching: message.isSearching,
      sources,
      images,
    });
  }

  if (message.toolCalls?.length) {
    blocks.push({
      id: `${message.id}-legacy-tools`,
      type: "tool_group",
      toolCalls: message.toolCalls.map(cloneToolCall),
    });
  }

  if (message.reasoning) {
    blocks.push({
      id: `${message.id}-legacy-reasoning`,
      type: "reasoning",
      content: message.reasoning,
    });
  }

  if (message.content) {
    blocks.push({
      id: `${message.id}-legacy-text`,
      type: "text",
      content: message.content,
    });
  }

  return blocks;
}
