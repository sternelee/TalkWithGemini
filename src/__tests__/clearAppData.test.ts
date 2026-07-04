import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RAGConfig } from "../types";

const {
  appDbMock,
  dirMock,
  encryptSecretMock,
  localforageClearMock,
  removeMock,
  tokenSecret,
} = vi.hoisted(() => {
  const tokenSecret = {
    v: 1,
    kid: "test-key",
    alg: "RSA-OAEP-256+A256GCM",
    iv: "iv",
    wrappedKey: "wrapped",
    ciphertext: "ciphertext",
    context: "rag:token",
  } as const;
  const removeMock = vi.fn(() => Promise.resolve());
  return {
    appDbMock: {
      getItem: vi.fn(),
      clear: vi.fn(() => Promise.resolve()),
    },
    dirMock: vi.fn(() => ({
      exists: vi.fn(() => Promise.resolve(true)),
      remove: removeMock,
    })),
    encryptSecretMock: vi.fn(async () => tokenSecret),
    localforageClearMock: vi.fn(() => Promise.resolve()),
    removeMock,
    tokenSecret,
  };
});

vi.mock("localforage", () => ({
  default: {
    clear: localforageClearMock,
  },
}));

vi.mock("opfs-tools", () => ({
  dir: dirMock,
  file: vi.fn(),
  write: vi.fn(),
}));

vi.mock("../store/storage/storageConfig", () => ({
  appDb: appDbMock,
  STORAGE_KEYS: {
    CORE_SETTINGS: "neo-chat-core-settings",
    SETTINGS: "neo-chat-settings",
    CHAT: "neo-chat-storage",
    KNOWLEDGE: "knowledge-storage",
    MEMORY: "neo-chat-memory",
  },
}));

vi.mock("../lib/byok/client", () => ({
  encryptSecret: encryptSecretMock,
}));

const { clearBrowserAppData } = await import("../lib/data/clearAppData");
const { deleteOPFSDirectory } = await import("../utils/opfs");

const ragConfig: RAGConfig = {
  enabled: true,
  url: "https://rag.example.com",
  token: "secret",
  topK: 10,
  chunkSize: 512,
  documentParseProvider: "mineru",
  mineruApiToken: "",
  llamaParseApiKey: "",
};

describe("clear app data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    encryptSecretMock.mockResolvedValue(tokenSecret);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      ),
    );
    appDbMock.getItem.mockResolvedValue(
      JSON.stringify({
        state: {
          collections: [
            {
              id: "collection-1",
              files: [
                {
                  id: "file-1",
                  ragId: "file-1",
                  ragChunkCount: 2,
                },
                {
                  id: "file-2",
                  ragId: "file-2",
                },
              ],
            },
          ],
        },
      }),
    );
  });

  it("cleans persisted RAG vectors and OPFS directories before clearing storage", async () => {
    await clearBrowserAppData(ragConfig);

    expect(fetch).toHaveBeenCalledWith(
      "/api/rag/delete",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"namespace":"collection-1"'),
      }),
    );
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    const requestBodies = fetchMock.mock.calls.map((call) =>
      JSON.parse(call[1].body),
    );
    expect(JSON.stringify(requestBodies[0])).not.toContain("secret");
    expect(requestBodies[0].tokenSecret).toEqual(tokenSecret);
    const allIds = requestBodies.flatMap((body) => body.ids);
    expect(allIds.slice(0, 3)).toEqual(["file-1_0", "file-1_1", "file-2_0"]);
    expect(allIds).toHaveLength(1002);

    expect(dirMock).toHaveBeenCalledWith("knowledge-base");
    expect(dirMock).toHaveBeenCalledWith("workspaces");
    expect(removeMock).toHaveBeenCalledWith({ force: true });

    expect(appDbMock.getItem.mock.invocationCallOrder[0]).toBeLessThan(
      appDbMock.clear.mock.invocationCallOrder[0],
    );
    expect(localforageClearMock).toHaveBeenCalled();
    expect(appDbMock.clear).toHaveBeenCalled();
  });

  it("continues local cleanup when RAG token encryption fails", async () => {
    encryptSecretMock.mockRejectedValueOnce(
      new Error("public key unavailable"),
    );

    await clearBrowserAppData(ragConfig);

    expect(fetch).not.toHaveBeenCalled();
    expect(dirMock).toHaveBeenCalledWith("knowledge-base");
    expect(localforageClearMock).toHaveBeenCalled();
    expect(appDbMock.clear).toHaveBeenCalled();
  });

  it("rejects unsafe OPFS directory paths", async () => {
    await deleteOPFSDirectory("../secret");

    expect(dirMock).not.toHaveBeenCalled();
  });
});
