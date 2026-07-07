import { afterEach, describe, expect, it, vi } from "vitest";
import { RAG_LIMITS } from "../config/limits";

const mocks = vi.hoisted(() => ({
  getState: vi.fn(),
  tokenSecret: {
    v: 1,
    kid: "test-key",
    alg: "RSA-OAEP-256+A256GCM",
    iv: "iv",
    wrappedKey: "wrapped",
    ciphertext: "ciphertext",
    context: "rag:token",
  },
}));

vi.mock("@/store/core/settingsStore", () => ({
  useSettingsStore: {
    getState: mocks.getState,
  },
}));

vi.mock("../lib/byok/client", () => ({
  encryptSecret: vi.fn(async () => mocks.tokenSecret),
  fetchWithByokRetry: vi.fn((requestFactory) => requestFactory()),
}));

vi.mock("../lib/api/client", async () => {
  const actual = await vi.importActual("../lib/api/client");
  return {
    ...actual,
    signedApiFetch: vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, init),
    ),
  };
});

describe("rag service batching", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mocks.getState.mockReset();
  });

  it("upserts vector items in API-sized batches", async () => {
    const { upsertToRAG } = await import("../services/api/ragService");
    mocks.getState.mockReturnValue({
      rag: { url: "https://rag.example", token: "secret" },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ success: true }));

    const items = Array.from(
      { length: RAG_LIMITS.maxItemsPerRequest + 1 },
      (_, index) => ({
        id: `item_${index}`,
        data: `chunk ${index}`,
      }),
    );

    await expect(upsertToRAG(items, "collection")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.items).toHaveLength(RAG_LIMITS.maxItemsPerRequest);
    expect(secondBody.items).toHaveLength(1);
    expect(firstBody.tokenSecret).toEqual(mocks.tokenSecret);
    expect(JSON.stringify(firstBody)).not.toContain("secret");
  });

  it("does not call RAG APIs when local credentials have no URL", async () => {
    const { upsertToRAG } = await import("../services/api/ragService");
    mocks.getState.mockReturnValue({
      rag: { token: "secret" },
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(
      upsertToRAG([{ id: "item", data: "chunk" }], "collection"),
    ).resolves.toBe(false);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses server default RAG without sending local URL or token", async () => {
    const { upsertToRAG } = await import("../services/api/ragService");
    mocks.getState.mockReturnValue({
      rag: {
        useDefaultVectorStore: true,
        serverVectorStoreAvailable: true,
      },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ success: true }));

    await expect(
      upsertToRAG([{ id: "item", data: "chunk" }], "collection"),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      useDefault: true,
    });
    expect(body).not.toHaveProperty("namespace");
    expect(body).not.toHaveProperty("url");
    expect(body).not.toHaveProperty("tokenSecret");
  });

  it("deletes vector ids in API-sized batches", async () => {
    const { deleteFromRAG } = await import("../services/api/ragService");
    mocks.getState.mockReturnValue({
      rag: { url: "https://rag.example", token: "secret" },
    });
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ success: true }));

    const ids = Array.from(
      { length: RAG_LIMITS.maxItemsPerRequest + 1 },
      (_, index) => `item_${index}`,
    );

    await expect(deleteFromRAG(ids, "collection")).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const secondBody = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(firstBody.ids).toHaveLength(RAG_LIMITS.maxItemsPerRequest);
    expect(secondBody.ids).toHaveLength(1);
    expect(firstBody.tokenSecret).toEqual(mocks.tokenSecret);
    expect(JSON.stringify(firstBody)).not.toContain("secret");
  });
});
