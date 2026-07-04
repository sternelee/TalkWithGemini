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
  results?: {
    sources?: Source[];
    images?: ImageSource[];
  };
}

const cloneToolCall = (toolCall: ToolCall): ToolCall => ({ ...toolCall });

const cloneBlock = (block: MessageOutputBlock): MessageOutputBlock => {
  switch (block.type) {
    case "text":
      return { ...block };
    case "reasoning":
      return { ...block };
    case "search":
      return {
        ...block,
        sources: [...block.sources],
        images: [...block.images],
      };
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
  for (let index = blocks.length - 1; index >= 0; index -= 1) {
    const block = blocks[index];
    if (block.type === "search" && block.isSearching) {
      activeSearchBlockId = block.id;
      break;
    }
  }

  const getLastBlock = () => blocks[blocks.length - 1];

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
      if (last?.type === "reasoning") {
        last.content += content;
        return;
      }
      blocks.push({
        id: createId(),
        type: "reasoning",
        content,
      });
    },

    upsertSearch(update: SearchBlockUpdate) {
      const activeTarget = activeSearchBlockId
        ? blocks.find(
            (block) =>
              block.type === "search" && block.id === activeSearchBlockId,
          )
        : undefined;
      const lastBlock = getLastBlock();
      const target: Extract<MessageOutputBlock, { type: "search" }> | undefined =
        activeTarget?.type === "search"
          ? activeTarget
          : lastBlock?.type === "search"
            ? lastBlock
            : undefined;

      const sources = update.results?.sources || [];
      const images = update.results?.images || [];
      const isSearching = update.isSearching ?? target?.isSearching ?? false;

      if (target?.type === "search") {
        target.isSearching = isSearching;
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
        sources,
        images,
      };
      blocks.push(block);
      activeSearchBlockId = isSearching ? block.id : undefined;
    },

    appendToolCall(toolCall: ToolCall) {
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
