import { v7 as uuidv7 } from "uuid";
import type { Message, MessageTreeNode, SessionMessageTree } from "@/types";

export interface MessageBranchInfo {
  index: number;
  count: number;
}

export interface NormalizeSessionMessageTreeOptions {
  createId?: () => string;
}

const createEmptyTree = (): SessionMessageTree => ({
  nodesById: {},
  rootMessageIds: [],
});

export function isSessionMessageTree(
  value: unknown,
): value is SessionMessageTree {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const candidate = value as Partial<SessionMessageTree>;
  return (
    !!candidate.nodesById &&
    typeof candidate.nodesById === "object" &&
    Array.isArray(candidate.rootMessageIds)
  );
}

function stripLegacyVersions(message: Message): Message {
  const { versions, activeVersionId, ...messageWithoutVersions } = message;
  void versions;
  void activeVersionId;
  return { ...messageWithoutVersions };
}

function cloneTree(tree: SessionMessageTree): SessionMessageTree {
  const nodesById: Record<string, MessageTreeNode> = {};

  for (const [id, node] of Object.entries(tree.nodesById)) {
    nodesById[id] = {
      id,
      message: stripLegacyVersions(node.message),
      parentMessageId: node.parentMessageId,
      childMessageIds: [...node.childMessageIds],
      activeChildMessageId: node.activeChildMessageId,
    };
  }

  return {
    nodesById,
    rootMessageIds: [...tree.rootMessageIds],
    activeRootMessageId: tree.activeRootMessageId,
  };
}

function createNode(
  message: Message,
  parentMessageId?: string,
): MessageTreeNode {
  return {
    id: message.id,
    message: stripLegacyVersions(message),
    parentMessageId,
    childMessageIds: [],
  };
}

function addChild(
  tree: SessionMessageTree,
  parentMessageId: string | undefined,
  childMessageId: string,
  makeActive = true,
) {
  if (!parentMessageId) {
    if (!tree.rootMessageIds.includes(childMessageId)) {
      tree.rootMessageIds.push(childMessageId);
    }
    if (makeActive) {
      tree.activeRootMessageId = childMessageId;
    }
    return;
  }

  const parent = tree.nodesById[parentMessageId];
  if (!parent) return;

  if (!parent.childMessageIds.includes(childMessageId)) {
    parent.childMessageIds.push(childMessageId);
  }
  if (makeActive) {
    parent.activeChildMessageId = childMessageId;
  }
}

function messageFromVersion(
  source: Message,
  id: string,
  version: NonNullable<Message["versions"]>[number],
  isActiveVersion: boolean,
): Message {
  return {
    ...stripLegacyVersions(source),
    id,
    content: version.content,
    reasoning: version.reasoning,
    timestamp: version.timestamp,
    model: version.model,
    timing: version.timing,
    suggestedQuestions: isActiveVersion ? source.suggestedQuestions : undefined,
  };
}

function normalizeLegacyMessages(
  messages: Message[],
  options: NormalizeSessionMessageTreeOptions,
): SessionMessageTree {
  const tree = createEmptyTree();
  const createId = options.createId || uuidv7;
  let previousActiveMessageId: string | undefined;

  for (const message of messages) {
    if (message.role === "model" && message.versions?.length) {
      const activeVersion =
        message.versions.find(
          (version) => version.id === message.activeVersionId,
        ) || message.versions[message.versions.length - 1];
      const activeVersionId = activeVersion?.id;
      let activeNodeId = message.id;

      for (const version of message.versions) {
        const isActiveVersion = version.id === activeVersionId;
        const nodeId = isActiveVersion ? message.id : createId();
        const versionMessage = messageFromVersion(
          message,
          nodeId,
          version,
          isActiveVersion,
        );

        tree.nodesById[nodeId] = createNode(
          versionMessage,
          previousActiveMessageId,
        );
        addChild(tree, previousActiveMessageId, nodeId, false);

        if (isActiveVersion) {
          activeNodeId = nodeId;
        }
      }

      if (previousActiveMessageId) {
        tree.nodesById[previousActiveMessageId].activeChildMessageId =
          activeNodeId;
      }
      previousActiveMessageId = activeNodeId;
      continue;
    }

    const node = createNode(message, previousActiveMessageId);
    tree.nodesById[node.id] = node;
    addChild(tree, previousActiveMessageId, node.id);
    previousActiveMessageId = node.id;
  }

  return tree;
}

function normalizeExistingTree(tree: SessionMessageTree): SessionMessageTree {
  const normalized = cloneTree(tree);

  normalized.rootMessageIds = normalized.rootMessageIds.filter(
    (id) => !!normalized.nodesById[id],
  );
  if (
    normalized.activeRootMessageId &&
    !normalized.rootMessageIds.includes(normalized.activeRootMessageId)
  ) {
    normalized.activeRootMessageId = normalized.rootMessageIds[0];
  }

  for (const node of Object.values(normalized.nodesById)) {
    node.childMessageIds = node.childMessageIds.filter(
      (childId) => !!normalized.nodesById[childId],
    );
    if (
      node.activeChildMessageId &&
      !node.childMessageIds.includes(node.activeChildMessageId)
    ) {
      node.activeChildMessageId = node.childMessageIds[0];
    }
  }

  return normalized;
}

export function normalizeSessionMessageTree(
  value: Message[] | SessionMessageTree | null | undefined,
  options: NormalizeSessionMessageTreeOptions = {},
): SessionMessageTree {
  if (isSessionMessageTree(value)) {
    return normalizeExistingTree(value);
  }

  if (Array.isArray(value)) {
    return normalizeLegacyMessages(value, options);
  }

  return createEmptyTree();
}

export function getActiveMessagePath(tree: SessionMessageTree): Message[] {
  const messages: Message[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined =
    tree.activeRootMessageId || tree.rootMessageIds[0];

  while (currentId && !visited.has(currentId)) {
    const node: MessageTreeNode | undefined = tree.nodesById[currentId];
    if (!node) break;

    visited.add(currentId);
    messages.push(node.message);
    currentId = node.activeChildMessageId;
  }

  return messages;
}

export function getAllMessagesFromTree(tree: SessionMessageTree): Message[] {
  const messages: Message[] = [];
  const visited = new Set<string>();

  const visit = (messageId: string) => {
    if (visited.has(messageId)) return;
    const node = tree.nodesById[messageId];
    if (!node) return;

    visited.add(messageId);
    messages.push(node.message);
    node.childMessageIds.forEach(visit);
  };

  tree.rootMessageIds.forEach(visit);
  return messages;
}

export function isMessageInActivePath(
  tree: SessionMessageTree,
  messageId: string,
): boolean {
  return getActiveMessagePath(tree).some((message) => message.id === messageId);
}

export function appendMessageToActivePath(
  tree: SessionMessageTree,
  message: Message,
): SessionMessageTree {
  const nextTree = cloneTree(tree);
  const activePath = getActiveMessagePath(nextTree);
  const parentMessageId = activePath[activePath.length - 1]?.id;
  const node = createNode(message, parentMessageId);

  nextTree.nodesById[node.id] = node;
  addChild(nextTree, parentMessageId, node.id);

  return nextTree;
}

export function updateMessageInTree(
  tree: SessionMessageTree,
  messageId: string,
  update: (message: Message) => Message,
): SessionMessageTree {
  const nextTree = cloneTree(tree);
  const node = nextTree.nodesById[messageId];
  if (!node) return nextTree;

  node.message = stripLegacyVersions(update(node.message));
  return nextTree;
}

export function createModelResponseBranch(
  tree: SessionMessageTree,
  messageId: string,
  message: Message,
): SessionMessageTree {
  const nextTree = cloneTree(tree);
  const sourceNode = nextTree.nodesById[messageId];
  if (!sourceNode || sourceNode.message.role !== "model") return nextTree;

  const parentMessageId = sourceNode.parentMessageId;
  const node = createNode(message, parentMessageId);
  nextTree.nodesById[node.id] = node;
  addChild(nextTree, parentMessageId, node.id);

  return nextTree;
}

export function createUserMessageBranch(
  tree: SessionMessageTree,
  messageId: string,
  message: Message,
): SessionMessageTree {
  const nextTree = cloneTree(tree);
  const sourceNode = nextTree.nodesById[messageId];
  if (!sourceNode || sourceNode.message.role !== "user") return nextTree;

  const parentMessageId = sourceNode.parentMessageId;
  const node = createNode(message, parentMessageId);
  nextTree.nodesById[node.id] = node;
  addChild(nextTree, parentMessageId, node.id);

  return nextTree;
}

function getSiblingIds(tree: SessionMessageTree, messageId: string): string[] {
  const node = tree.nodesById[messageId];
  if (!node) return [];

  if (!node.parentMessageId) {
    return tree.rootMessageIds.filter(
      (rootId) => tree.nodesById[rootId]?.message.role === node.message.role,
    );
  }

  const parent = tree.nodesById[node.parentMessageId];
  if (!parent) return [];

  return parent.childMessageIds.filter(
    (childId) => tree.nodesById[childId]?.message.role === node.message.role,
  );
}

export function getMessageBranchInfo(
  tree: SessionMessageTree,
  messageId: string,
): MessageBranchInfo {
  const siblings = getSiblingIds(tree, messageId);
  const index = siblings.indexOf(messageId);

  return {
    index: index === -1 ? 0 : index,
    count: siblings.length || 1,
  };
}

export function switchMessageBranch(
  tree: SessionMessageTree,
  messageId: string,
  direction: "prev" | "next",
): SessionMessageTree {
  const nextTree = cloneTree(tree);
  const node = nextTree.nodesById[messageId];
  if (!node) return nextTree;

  const siblings = getSiblingIds(nextTree, messageId);
  const currentIndex = siblings.indexOf(messageId);
  if (currentIndex === -1) return nextTree;

  const targetIndex =
    direction === "prev"
      ? Math.max(0, currentIndex - 1)
      : Math.min(siblings.length - 1, currentIndex + 1);
  const targetId = siblings[targetIndex];
  if (!targetId) return nextTree;

  if (!node.parentMessageId) {
    nextTree.activeRootMessageId = targetId;
    return nextTree;
  }

  const parent = nextTree.nodesById[node.parentMessageId];
  if (parent) {
    parent.activeChildMessageId = targetId;
  }

  return nextTree;
}

function collectSubtreeMessages(
  tree: SessionMessageTree,
  rootMessageId: string,
): Message[] {
  const messages: Message[] = [];
  const visited = new Set<string>();

  const visit = (messageId: string) => {
    if (visited.has(messageId)) return;
    const node = tree.nodesById[messageId];
    if (!node) return;

    visited.add(messageId);
    messages.push(node.message);
    node.childMessageIds.forEach(visit);
  };

  visit(rootMessageId);
  return messages;
}

function deleteSubtree(tree: SessionMessageTree, rootMessageId: string) {
  const visited = new Set<string>();

  const visit = (messageId: string) => {
    if (visited.has(messageId)) return;
    const node = tree.nodesById[messageId];
    if (!node) return;

    visited.add(messageId);
    node.childMessageIds.forEach(visit);
    delete tree.nodesById[messageId];
  };

  visit(rootMessageId);
}

export function removeActivePathAfter(
  tree: SessionMessageTree,
  messageId: string,
): { tree: SessionMessageTree; removedMessages: Message[] } {
  const nextTree = cloneTree(tree);
  const node = nextTree.nodesById[messageId];
  const childMessageId = node?.activeChildMessageId;
  if (!node || !childMessageId) {
    return { tree: nextTree, removedMessages: [] };
  }

  const removedMessages = collectSubtreeMessages(nextTree, childMessageId);
  deleteSubtree(nextTree, childMessageId);
  node.childMessageIds = node.childMessageIds.filter(
    (id) => id !== childMessageId,
  );
  node.activeChildMessageId = node.childMessageIds[0];

  return { tree: nextTree, removedMessages };
}

export function removeMessageSubtree(
  tree: SessionMessageTree,
  messageId: string,
): { tree: SessionMessageTree; removedMessages: Message[] } {
  const nextTree = cloneTree(tree);
  const node = nextTree.nodesById[messageId];
  if (!node) return { tree: nextTree, removedMessages: [] };

  const removedMessages = collectSubtreeMessages(nextTree, messageId);

  if (node.parentMessageId) {
    const parent = nextTree.nodesById[node.parentMessageId];
    if (parent) {
      parent.childMessageIds = parent.childMessageIds.filter(
        (childId) => childId !== messageId,
      );
      if (parent.activeChildMessageId === messageId) {
        parent.activeChildMessageId = parent.childMessageIds[0];
      }
    }
  } else {
    nextTree.rootMessageIds = nextTree.rootMessageIds.filter(
      (rootId) => rootId !== messageId,
    );
    if (nextTree.activeRootMessageId === messageId) {
      nextTree.activeRootMessageId = nextTree.rootMessageIds[0];
    }
  }

  deleteSubtree(nextTree, messageId);

  return { tree: nextTree, removedMessages };
}

export function removeMessageFromTree(
  tree: SessionMessageTree,
  messageId: string,
): { tree: SessionMessageTree; removedMessages: Message[] } {
  const nextTree = cloneTree(tree);
  const node = nextTree.nodesById[messageId];
  if (!node) return { tree: nextTree, removedMessages: [] };

  const childMessageIds = [...node.childMessageIds];
  const replacementActiveChildId =
    node.activeChildMessageId || childMessageIds[0];

  for (const childId of childMessageIds) {
    const child = nextTree.nodesById[childId];
    if (child) {
      child.parentMessageId = node.parentMessageId;
    }
  }

  if (node.parentMessageId) {
    const parent = nextTree.nodesById[node.parentMessageId];
    if (parent) {
      parent.childMessageIds = parent.childMessageIds.flatMap((childId) =>
        childId === messageId ? childMessageIds : [childId],
      );
      if (parent.activeChildMessageId === messageId) {
        parent.activeChildMessageId =
          replacementActiveChildId || parent.childMessageIds[0];
      }
    }
  } else {
    nextTree.rootMessageIds = nextTree.rootMessageIds.flatMap((rootId) =>
      rootId === messageId ? childMessageIds : [rootId],
    );
    if (nextTree.activeRootMessageId === messageId) {
      nextTree.activeRootMessageId =
        replacementActiveChildId || nextTree.rootMessageIds[0];
    }
  }

  delete nextTree.nodesById[messageId];

  return { tree: nextTree, removedMessages: [node.message] };
}

export function cloneMessageTreeWithNewIds(
  tree: SessionMessageTree,
  createId: () => string = uuidv7,
): SessionMessageTree {
  const normalized = normalizeExistingTree(tree);
  const idMap = new Map<string, string>();

  for (const id of Object.keys(normalized.nodesById)) {
    idMap.set(id, createId());
  }

  const nodesById: Record<string, MessageTreeNode> = {};
  for (const [oldId, node] of Object.entries(normalized.nodesById)) {
    const newId = idMap.get(oldId);
    if (!newId) continue;

    const parentMessageId = node.parentMessageId
      ? idMap.get(node.parentMessageId)
      : undefined;
    nodesById[newId] = {
      id: newId,
      message: {
        ...stripLegacyVersions(node.message),
        id: newId,
        suggestedQuestions: undefined,
      },
      parentMessageId,
      childMessageIds: node.childMessageIds
        .map((childId) => idMap.get(childId))
        .filter((childId): childId is string => !!childId),
      activeChildMessageId: node.activeChildMessageId
        ? idMap.get(node.activeChildMessageId)
        : undefined,
    };
  }

  return {
    nodesById,
    rootMessageIds: normalized.rootMessageIds
      .map((rootId) => idMap.get(rootId))
      .filter((rootId): rootId is string => !!rootId),
    activeRootMessageId: normalized.activeRootMessageId
      ? idMap.get(normalized.activeRootMessageId)
      : undefined,
  };
}
