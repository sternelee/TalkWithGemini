import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { appDbMock, storedItems } = vi.hoisted(() => {
  const storedItems = new Map<string, unknown>();
  const appDbMock = {
    getItem: vi.fn(async (key: string) => storedItems.get(key)),
    keys: vi.fn(async () => [...storedItems.keys()]),
  };

  return { appDbMock, storedItems };
});

vi.mock("../store/storage/storageConfig", () => ({
  appDb: appDbMock,
  STORAGE_KEYS: {
    CORE_SETTINGS: "neo-chat-core-settings",
    SETTINGS: "neo-chat-settings",
    CHAT: "neo-chat-storage",
    KNOWLEDGE: "knowledge-storage",
    MEMORY: "neo-chat-memory",
  },
  STORAGE_VERSION: 4,
}));

import {
  APP_EXPORT_VERSION,
  collectOrphanOpfsUrls,
  collectReferencedOpfsUrls,
  createAppExportPayload,
  createBrowserAppExportPayload,
} from "../lib/data/appExport";
import { STORAGE_VERSION } from "../store/storage/storageConfig";
import { enqueueSessionMessageWrite } from "../store/sessionMessagePersistence";

describe("app export helpers", () => {
  beforeEach(() => {
    storedItems.clear();
    vi.clearAllMocks();
    appDbMock.getItem.mockImplementation(async (key: string) =>
      storedItems.get(key),
    );
    appDbMock.keys.mockImplementation(async () => [...storedItems.keys()]);
    vi.stubGlobal("window", {
      localStorage: {
        getItem: vi.fn(() => null),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a versioned local-first export payload", () => {
    const payload = createAppExportPayload({
      exportedAt: "2026-07-01T00:00:00.000Z",
      coreSettings: { theme: "dark" },
      settings: { activePlugins: ["weather"] },
      chat: { sessions: [{ id: "s1", title: "Chat" }] },
      sessionMessages: {
        s1: {
          nodesById: {},
          rootMessageIds: [],
        },
      },
      knowledge: { collections: [] },
      memory: { memories: [{ id: "mem-1" }] },
    });

    expect(APP_EXPORT_VERSION).toBe(2);
    expect(payload).toEqual({
      exportVersion: APP_EXPORT_VERSION,
      storageVersion: STORAGE_VERSION,
      exportedAt: "2026-07-01T00:00:00.000Z",
      metadata: {
        opfs: {
          mode: "references-only",
          includesBlobs: false,
        },
      },
      data: {
        coreSettings: { theme: "dark" },
        settings: { activePlugins: ["weather"] },
        chat: { sessions: [{ id: "s1", title: "Chat" }] },
        sessionMessages: {
          s1: {
            nodesById: {},
            rootMessageIds: [],
          },
        },
        knowledge: { collections: [] },
        memory: { memories: [{ id: "mem-1" }] },
      },
    });
  });

  it("exports every stored session message tree, including orphans", async () => {
    const storedMessageTree = {
      nodesById: {
        message1: {
          id: "message1",
          message: {
            id: "message1",
            role: "model",
            content: "image",
            timestamp: 1,
            attachments: [
              {
                id: "image1",
                fileName: "image.png",
                mimeType: "image/png",
                url: "opfs://images/generated/image.png",
              },
            ],
          },
          childMessageIds: [],
        },
      },
      rootMessageIds: ["message1"],
      activeRootMessageId: "message1",
    };
    const orphanMessageTree = {
      nodesById: {},
      rootMessageIds: [],
    };
    storedItems.set(
      "neo-chat-storage",
      JSON.stringify({ state: { sessions: [{ id: "session1" }] } }),
    );
    storedItems.set("session_messages_session1", storedMessageTree);
    storedItems.set("session_messages_orphan", orphanMessageTree);
    storedItems.set("unrelated-record", { ignored: true });

    const payload = await createBrowserAppExportPayload();

    expect(payload.data.chat).toEqual({
      state: { sessions: [{ id: "session1" }] },
    });
    expect(payload.data.sessionMessages).toEqual({
      session1: storedMessageTree,
      orphan: orphanMessageTree,
    });
    expect(
      (payload.data.sessionMessages.session1 as typeof storedMessageTree)
        .nodesById.message1.message.attachments[0].url,
    ).toBe("opfs://images/generated/image.png");
    expect(appDbMock.keys).toHaveBeenCalledOnce();
    expect(appDbMock.getItem).toHaveBeenCalledWith("session_messages_orphan");
    expect(appDbMock.getItem).not.toHaveBeenCalledWith("unrelated-record");
  });

  it("waits for pending message persistence before enumerating export data", async () => {
    const latestTree = {
      nodesById: {},
      rootMessageIds: [],
      activeRootMessageId: null,
    };
    let resolveWrite: (() => void) | undefined;
    const write = enqueueSessionMessageWrite(
      "pending-session",
      () =>
        new Promise<void>((resolve) => {
          resolveWrite = () => {
            storedItems.set("session_messages_pending-session", latestTree);
            resolve();
          };
        }),
    );

    const exportPromise = createBrowserAppExportPayload();
    await Promise.resolve();
    expect(appDbMock.keys).not.toHaveBeenCalled();

    resolveWrite?.();
    await write;
    const payload = await exportPromise;

    expect(payload.data.sessionMessages).toEqual({
      "pending-session": latestTree,
    });
  });

  it("rejects instead of returning a partial export when a message tree read fails", async () => {
    storedItems.set("session_messages_session1", {
      nodesById: {},
      rootMessageIds: [],
    });
    storedItems.set("session_messages_broken", {
      nodesById: {},
      rootMessageIds: [],
    });
    appDbMock.getItem.mockImplementation(async (key: string) => {
      if (key === "session_messages_broken") {
        throw new Error("IndexedDB read failed");
      }
      return storedItems.get(key);
    });

    await expect(createBrowserAppExportPayload()).rejects.toThrow(
      "IndexedDB read failed",
    );
  });

  it("collects referenced OPFS URLs and identifies app-owned orphans", () => {
    const referenced = collectReferencedOpfsUrls({
      chat: {
        workspaces: [
          {
            files: [
              { url: "opfs://workspaces/w1/preset.txt" },
              { url: "https://example.com/remote.txt" },
            ],
          },
        ],
        sessions: [
          {
            messages: [
              {
                attachments: [
                  {
                    url: "opfs://chat/s1/attachment.txt",
                    displayCache: {
                      opfsUrl: "opfs://images/generated/display-cache.png",
                    },
                  },
                ],
                outputBlocks: [
                  {
                    type: "image",
                    image: {
                      displayCache: {
                        opfsUrl: "opfs://images/generated/output-block.png",
                      },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      knowledge: {
        collections: [
          {
            files: [{ path: "opfs://knowledge-base/c1/local.md" }],
          },
        ],
      },
    });

    expect([...referenced].sort()).toEqual([
      "opfs://chat/s1/attachment.txt",
      "opfs://images/generated/display-cache.png",
      "opfs://images/generated/output-block.png",
      "opfs://knowledge-base/c1/local.md",
      "opfs://workspaces/w1/preset.txt",
    ]);
    expect(
      collectOrphanOpfsUrls({
        existingUrls: [
          "opfs://chat/s1/attachment.txt",
          "opfs://chat/s1/orphan.txt",
          "opfs://external/outside.txt",
        ],
        referencedUrls: referenced,
      }),
    ).toEqual(["opfs://chat/s1/orphan.txt"]);
  });
});
