import { describe, expect, it, vi } from "vitest";
import {
  buildGlobalSearchIndex,
  createGlobalSearchSourceRevisions,
  getGlobalSearchHighlightSegments,
  GlobalSearchCancelledError,
  normalizeGlobalSearchText,
  searchGlobalIndex,
} from "../lib/global-search";
import type {
  Collection,
  MemoryRecord,
  Session,
  SessionMessageTree,
  Workspace,
} from "../types";

const session: Session = {
  id: "session-1",
  title: "产品讨论",
  messageCount: 2,
  updatedAt: 2_000,
  model: "test:model",
  workspaceId: "workspace-1",
};

const activeBranchTree: SessionMessageTree = {
  nodesById: {
    user: {
      id: "user",
      message: {
        id: "user",
        role: "user",
        content: "请检查当前方案",
        timestamp: 1_000,
        attachments: [
          {
            id: "attachment",
            mimeType: "application/pdf",
            fileName: "roadmap.pdf",
            url: "opfs://chat/roadmap.pdf",
          },
        ],
      },
      childMessageIds: ["hidden", "active"],
      activeChildMessageId: "active",
    },
    hidden: {
      id: "hidden",
      message: {
        id: "hidden",
        role: "model",
        content: "non-active-secret",
        timestamp: 1_100,
      },
      parentMessageId: "user",
      childMessageIds: [],
    },
    active: {
      id: "active",
      message: {
        id: "active",
        role: "model",
        content: "当前分支可见内容",
        reasoning: "private-chain-of-thought",
        timestamp: 1_200,
        toolCalls: [
          {
            id: "tool",
            name: "lookup",
            args: { secret: "tool-argument-secret" },
            result: "tool-result-secret",
            status: "success",
          },
        ],
      },
      parentMessageId: "user",
      childMessageIds: [],
    },
  },
  rootMessageIds: ["user"],
  activeRootMessageId: "user",
};

const workspace: Workspace = {
  id: "workspace-1",
  name: "AI Lab",
  systemPrompt: "Workspace instructions",
  knowledgeCollectionIds: ["collection-1"],
  files: [],
  createdAt: 500,
};

const collection: Collection = {
  id: "collection-1",
  name: "产品资料",
  description: "内部文档",
  updatedAt: 1_500,
  icon: "book",
  color: "blue",
  files: [
    {
      id: "file-1",
      name: "说明书.pdf",
      size: 100,
      type: "application/pdf",
      uploadedAt: 1_400,
      status: "saved",
      path: "opfs://knowledge/content.txt",
    },
  ],
};

const memory: MemoryRecord = {
  id: "memory-1",
  type: "preference",
  content: "用户喜欢简洁的界面",
  tags: ["design"],
  importance: 3,
  source: "manual",
  createdAt: 700,
  updatedAt: 800,
};

async function buildIndex(
  overrides: Partial<Parameters<typeof buildGlobalSearchIndex>[0]> = {},
) {
  return buildGlobalSearchIndex({
    sessions: [session],
    workspaces: [workspace],
    knowledgeCollections: [collection],
    memories: [memory],
    loadSessionTree: vi.fn(async () => activeBranchTree),
    readKnowledgeContent: vi.fn(async () => ({
      content: "知识库中的中文内容",
    })),
    ...overrides,
  });
}

describe("global search", () => {
  it("indexes only the active message branch and excludes private tool data", async () => {
    const index = await buildIndex();

    expect(searchGlobalIndex(index, "当前分支")).toHaveLength(1);
    expect(searchGlobalIndex(index, "roadmap.pdf")[0]?.document.target).toEqual(
      {
        type: "message",
        sessionId: "session-1",
        messageId: "user",
      },
    );
    expect(searchGlobalIndex(index, "non-active-secret")).toEqual([]);
    expect(searchGlobalIndex(index, "private-chain-of-thought")).toEqual([]);
    expect(searchGlobalIndex(index, "tool-argument-secret")).toEqual([]);
    expect(searchGlobalIndex(index, "tool-result-secret")).toEqual([]);
  });

  it("normalizes Unicode width and supports CJK substring search", async () => {
    const index = await buildIndex();

    expect(normalizeGlobalSearchText("ＡＩ　LAB")).toBe("ai lab");
    expect(searchGlobalIndex(index, "ＡＩ")[0]?.document.target).toEqual({
      type: "workspace",
      workspaceId: "workspace-1",
    });
    expect(searchGlobalIndex(index, "库中的中文")[0]?.document.target).toEqual({
      type: "knowledge",
      collectionId: "collection-1",
      fileId: "file-1",
    });
  });

  it("applies source, workspace, role, date, and time sorting filters", async () => {
    const index = await buildIndex();
    const results = searchGlobalIndex(index, "内容", {
      filters: {
        sources: ["session"],
        workspaceId: "workspace-1",
        roles: ["model"],
      },
      sort: "oldest",
    });

    expect(results.map((result) => result.document.id)).toEqual([
      "message:session-1:active",
    ]);
    expect(
      searchGlobalIndex(index, "内容", { filters: { dateFrom: 1_300 } }).map(
        (result) => result.document.source,
      ),
    ).toEqual(["knowledge"]);
    expect(
      searchGlobalIndex(index, "知识库", {
        filters: { workspaceId: "workspace-1" },
      })[0]?.document.source,
    ).toBe("knowledge");
  });

  it("reports truncation and per-source read failures as a partial index", async () => {
    const truncated = await buildIndex({
      limits: { maxSingleContentChars: 5, maxTotalContentChars: 100 },
    });
    expect(truncated.partial).toBe(true);

    const failed = await buildIndex({
      readKnowledgeContent: vi.fn(async () => {
        throw new Error("missing local file");
      }),
    });
    expect(failed.partial).toBe(true);
    expect(failed.errors).toEqual([
      {
        source: "knowledge",
        id: "file-1",
        message: "missing local file",
      },
    ]);
    expect(searchGlobalIndex(failed, "说明书")).toHaveLength(1);
  });

  it("keeps later metadata searchable after the full-document limit", async () => {
    const index = await buildIndex({
      limits: { maxDocuments: 1, maxMetadataDocuments: 100 },
    });

    expect(index.partial).toBe(true);
    expect(searchGlobalIndex(index, "说明书.pdf")).toHaveLength(1);
    expect(searchGlobalIndex(index, "Workspace instructions")).toHaveLength(0);
  });

  it("can rebuild one source without scanning unrelated sources", async () => {
    const loadSessionTree = vi.fn(async () => activeBranchTree);
    const readKnowledgeContent = vi.fn(async () => ({
      content: "知识库中的中文内容",
    }));
    const index = await buildIndex({
      sources: ["memory"],
      loadSessionTree,
      readKnowledgeContent,
    });

    expect(
      index.documents.every((document) => document.source === "memory"),
    ).toBe(true);
    expect(loadSessionTree).not.toHaveBeenCalled();
    expect(readKnowledgeContent).not.toHaveBeenCalled();
  });

  it("invalidates the session source when active branch text changes", () => {
    const first = createGlobalSearchSourceRevisions({
      sessions: [session],
      workspaces: [workspace],
      knowledgeCollections: [collection],
      memories: [memory],
      currentSessionId: session.id,
      activeMessageTree: activeBranchTree,
    });
    const changedTree: SessionMessageTree = {
      ...activeBranchTree,
      nodesById: {
        ...activeBranchTree.nodesById,
        active: {
          ...activeBranchTree.nodesById.active,
          message: {
            ...activeBranchTree.nodesById.active.message,
            content: "流式更新后的正文",
          },
        },
      },
    };
    const second = createGlobalSearchSourceRevisions({
      sessions: [session],
      workspaces: [workspace],
      knowledgeCollections: [collection],
      memories: [memory],
      currentSessionId: session.id,
      activeMessageTree: changedTree,
    });

    expect(second.session).not.toBe(first.session);
    expect(second.knowledge).toBe(first.knowledge);
  });

  it("cancels indexing without returning a partially built result", async () => {
    const controller = new AbortController();
    await expect(
      buildIndex({
        signal: controller.signal,
        onProgress: () => controller.abort(),
      }),
    ).rejects.toBeInstanceOf(GlobalSearchCancelledError);
  });

  it("creates safe highlight segments without HTML injection", () => {
    expect(
      getGlobalSearchHighlightSegments("<script>AI</script>", "ai"),
    ).toEqual([
      { text: "<script>", highlighted: false },
      { text: "AI", highlighted: true },
      { text: "</script>", highlighted: false },
    ]);
  });
});
