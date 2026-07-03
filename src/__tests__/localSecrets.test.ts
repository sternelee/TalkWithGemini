import { afterEach, describe, expect, it } from "vitest";
import {
  clearLocalSecretKeyCache,
  decryptLocalSecret,
  deleteLocalSecretMasterKey,
  encryptLocalSecret,
  LOCAL_SECRET_CONTEXTS,
} from "../lib/security/localSecrets";

type FakeRequest<T> = {
  result: T;
  error: Error | null;
  onsuccess: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
};

type FakeOpenRequest = FakeRequest<IDBDatabase> & {
  onupgradeneeded: ((event: Event) => void) | null;
};

const originalIndexedDb =
  typeof indexedDB === "undefined" ? undefined : indexedDB;
const originalIndexedDbDescriptor = Object.getOwnPropertyDescriptor(
  globalThis,
  "indexedDB",
);

function restoreIndexedDb(): void {
  if (originalIndexedDbDescriptor) {
    Object.defineProperty(globalThis, "indexedDB", originalIndexedDbDescriptor);
    return;
  }

  if (originalIndexedDb) {
    Object.defineProperty(globalThis, "indexedDB", {
      configurable: true,
      value: originalIndexedDb,
    });
    return;
  }

  delete (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB;
}

function setIndexedDb(dbFactory: IDBFactory | undefined): void {
  Object.defineProperty(globalThis, "indexedDB", {
    configurable: true,
    value: dbFactory,
  });
}

function successfulRequest<T>(result: T): IDBRequest<T> {
  const request: FakeRequest<T> = {
    result,
    error: null,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => request.onsuccess?.({} as Event));
  return request as unknown as IDBRequest<T>;
}

function failedRequest<T>(error: Error): IDBRequest<T> {
  const request: FakeRequest<T> = {
    result: undefined as T,
    error,
    onsuccess: null,
    onerror: null,
  };
  queueMicrotask(() => request.onerror?.({} as Event));
  return request as unknown as IDBRequest<T>;
}

function successfulOpenRequest(db: IDBDatabase): IDBOpenDBRequest {
  const request: FakeOpenRequest = {
    result: db,
    error: null,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
  queueMicrotask(() => request.onsuccess?.({} as Event));
  return request as unknown as IDBOpenDBRequest;
}

function failedOpenRequest(error: Error): IDBOpenDBRequest {
  const request: FakeOpenRequest = {
    result: undefined as unknown as IDBDatabase,
    error,
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
  };
  queueMicrotask(() => request.onerror?.({} as Event));
  return request as unknown as IDBOpenDBRequest;
}

function createFailingOpenIndexedDb(error: Error): IDBFactory {
  return {
    open: () => failedOpenRequest(error),
  } as unknown as IDBFactory;
}

function createFailingWriteIndexedDb(error: Error): IDBFactory {
  const store = {
    get: () => successfulRequest(undefined),
    put: () => failedRequest(error),
  };
  const db = {
    close: () => {},
    transaction: () => ({
      objectStore: () => store,
    }),
  } as unknown as IDBDatabase;

  return {
    open: () => successfulOpenRequest(db),
  } as unknown as IDBFactory;
}

describe("local secret envelopes", () => {
  afterEach(async () => {
    restoreIndexedDb();
    await deleteLocalSecretMasterKey();
    clearLocalSecretKeyCache();
  });

  it("roundtrips secrets without storing the plaintext", async () => {
    const envelope = await encryptLocalSecret(
      "local-secret-value",
      LOCAL_SECRET_CONTEXTS.providerApiKey("ABCDEF"),
    );

    expect(envelope).toMatchObject({
      v: 1,
      alg: "A256GCM",
      context: LOCAL_SECRET_CONTEXTS.providerApiKey("ABCDEF"),
    });
    expect(JSON.stringify(envelope)).not.toContain("local-secret-value");
    await expect(
      decryptLocalSecret(
        envelope,
        LOCAL_SECRET_CONTEXTS.providerApiKey("ABCDEF"),
      ),
    ).resolves.toBe("local-secret-value");
  });

  it("rejects mismatched contexts", async () => {
    const envelope = await encryptLocalSecret(
      "search-secret",
      LOCAL_SECRET_CONTEXTS.searchApiKey("tavily"),
    );

    await expect(
      decryptLocalSecret(envelope, LOCAL_SECRET_CONTEXTS.searchApiKey("exa")),
    ).rejects.toThrow(/context/i);
  });

  it("rejects tampered ciphertext", async () => {
    const envelope = await encryptLocalSecret(
      "rag-secret",
      LOCAL_SECRET_CONTEXTS.ragToken,
    );
    expect(envelope).toBeDefined();

    await expect(
      decryptLocalSecret(
        {
          ...envelope!,
          ciphertext: `${envelope!.ciphertext[0] === "A" ? "B" : "A"}${envelope!.ciphertext.slice(1)}`,
        },
        LOCAL_SECRET_CONTEXTS.ragToken,
      ),
    ).rejects.toThrow();
  });

  it("keeps encrypted settings usable after clearing the in-memory cache", async () => {
    const envelope = await encryptLocalSecret(
      "plugin-secret",
      LOCAL_SECRET_CONTEXTS.pluginAuth("demo"),
    );

    clearLocalSecretKeyCache();

    await expect(
      decryptLocalSecret(envelope, LOCAL_SECRET_CONTEXTS.pluginAuth("demo")),
    ).resolves.toBe("plugin-secret");
  });

  it("uses an in-memory key when IndexedDB is unavailable", async () => {
    setIndexedDb(undefined);

    const envelope = await encryptLocalSecret(
      "memory-only-secret",
      LOCAL_SECRET_CONTEXTS.providerApiKey("MEMORY"),
    );

    expect(globalThis.__neoChatLocalSecretKeyMaterial).toBeDefined();
    await expect(
      decryptLocalSecret(
        envelope,
        LOCAL_SECRET_CONTEXTS.providerApiKey("MEMORY"),
      ),
    ).resolves.toBe("memory-only-secret");
  });

  it("does not fall back to a transient key when IndexedDB reads fail", async () => {
    setIndexedDb(createFailingOpenIndexedDb(new Error("open failed")));

    await expect(
      encryptLocalSecret(
        "unpersisted-secret",
        LOCAL_SECRET_CONTEXTS.providerApiKey("READ_FAIL"),
      ),
    ).rejects.toThrow(/open failed/);
    expect(globalThis.__neoChatLocalSecretKeyMaterial).toBeUndefined();
  });

  it("does not use a generated key when IndexedDB writes fail", async () => {
    setIndexedDb(createFailingWriteIndexedDb(new Error("put failed")));

    await expect(
      encryptLocalSecret(
        "unpersisted-secret",
        LOCAL_SECRET_CONTEXTS.providerApiKey("WRITE_FAIL"),
      ),
    ).rejects.toThrow(/put failed/);
    expect(globalThis.__neoChatLocalSecretKeyMaterial).toBeUndefined();
  });
});
