import {
  arrayBufferToBytes,
  base64UrlToBytes,
  bytesToBase64Url,
} from "../byok/encoding";

export const LOCAL_SECRET_ALG = "A256GCM" as const;

export interface LocalEncryptedSecretEnvelope {
  v: 1;
  alg: typeof LOCAL_SECRET_ALG;
  keyId: string;
  iv: string;
  ciphertext: string;
  context: string;
}

export const LOCAL_SECRET_CONTEXTS = {
  providerApiKey: (providerId: string) =>
    `local:provider:${providerId}:api-key`,
  searchApiKey: (provider: string) => `local:search:${provider}:api-key`,
  ragToken: "local:rag:token",
  mineruApiToken: "local:docs:mineru:api-token",
  llamaParseApiKey: "local:docs:llama-parse:api-key",
  elevenLabsApiKey: "local:voice:elevenlabs:api-key",
  mimoApiKey: "local:voice:mimo:api-key",
  pluginAuth: (pluginId: string) => `local:plugin:${pluginId}:auth`,
} as const;

const DB_NAME = "neo-chat-local-secrets";
const DB_VERSION = 1;
const STORE_NAME = "crypto_keys";
const MASTER_KEY_RECORD_ID = "default";

type LocalKeyMaterial = {
  id: string;
  key: CryptoKey;
};

type StoredKeyRecord = {
  id: string;
  keyId: string;
  key: CryptoKey;
};

declare global {
  // Used only when IndexedDB is unavailable, such as SSR or unit tests.
  var __neoChatLocalSecretKeyMaterial: LocalKeyMaterial | undefined;
}

let keyMaterialPromise: Promise<LocalKeyMaterial> | null = null;

function getCrypto(): Crypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error("WebCrypto is required to encrypt local secrets.");
  }
  return globalThis.crypto;
}

function getIndexedDb(): IDBFactory | undefined {
  return typeof indexedDB !== "undefined" ? indexedDB : undefined;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB failed"));
  });
}

function openDb(): Promise<IDBDatabase> {
  const dbFactory = getIndexedDb();
  if (!dbFactory) {
    return Promise.reject(new Error("IndexedDB is unavailable"));
  }

  return new Promise((resolve, reject) => {
    const request = dbFactory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error || new Error("IndexedDB failed"));
  });
}

async function readStoredKey(): Promise<LocalKeyMaterial | null> {
  if (!getIndexedDb()) return null;

  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const record = await requestToPromise<StoredKeyRecord | undefined>(
      store.get(MASTER_KEY_RECORD_ID),
    );
    return record?.key ? { id: record.keyId, key: record.key } : null;
  } finally {
    db.close();
  }
}

async function writeStoredKey(material: LocalKeyMaterial): Promise<void> {
  if (!getIndexedDb()) {
    globalThis.__neoChatLocalSecretKeyMaterial = material;
    return;
  }

  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await requestToPromise(
      store.put({
        id: MASTER_KEY_RECORD_ID,
        keyId: material.id,
        key: material.key,
      } satisfies StoredKeyRecord),
    );
  } finally {
    db.close();
  }
}

function createKeyId(): string {
  const crypto = getCrypto();
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToBase64Url(bytes);
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

async function createMasterKey(): Promise<LocalKeyMaterial> {
  const crypto = getCrypto();
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return { id: createKeyId(), key };
}

async function loadKeyMaterial(): Promise<LocalKeyMaterial> {
  if (globalThis.__neoChatLocalSecretKeyMaterial) {
    return globalThis.__neoChatLocalSecretKeyMaterial;
  }

  if (!getIndexedDb()) {
    const material = await createMasterKey();
    globalThis.__neoChatLocalSecretKeyMaterial = material;
    return material;
  }

  const stored = await readStoredKey();
  if (stored) {
    globalThis.__neoChatLocalSecretKeyMaterial = stored;
    return stored;
  }

  const material = await createMasterKey();
  await writeStoredKey(material);
  globalThis.__neoChatLocalSecretKeyMaterial = material;
  return material;
}

async function getKeyMaterial(): Promise<LocalKeyMaterial> {
  if (!keyMaterialPromise) {
    keyMaterialPromise = loadKeyMaterial().catch((error) => {
      keyMaterialPromise = null;
      throw error;
    });
  }

  return keyMaterialPromise;
}

export function clearLocalSecretKeyCache(): void {
  keyMaterialPromise = null;
}

export async function deleteLocalSecretMasterKey(): Promise<void> {
  keyMaterialPromise = null;
  globalThis.__neoChatLocalSecretKeyMaterial = undefined;

  if (!getIndexedDb()) return;

  const db = await openDb();
  try {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    await requestToPromise(store.delete(MASTER_KEY_RECORD_ID));
  } finally {
    db.close();
  }
}

export function isLocalEncryptedSecretEnvelope(
  value: unknown,
): value is LocalEncryptedSecretEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Partial<LocalEncryptedSecretEnvelope>;
  return (
    envelope.v === 1 &&
    envelope.alg === LOCAL_SECRET_ALG &&
    typeof envelope.keyId === "string" &&
    envelope.keyId.length > 0 &&
    typeof envelope.iv === "string" &&
    envelope.iv.length > 0 &&
    typeof envelope.ciphertext === "string" &&
    envelope.ciphertext.length > 0 &&
    typeof envelope.context === "string" &&
    envelope.context.length > 0
  );
}

export function hasLocalSecret(
  value: unknown,
): value is LocalEncryptedSecretEnvelope {
  return isLocalEncryptedSecretEnvelope(value);
}

export async function encryptLocalSecret(
  secret: string | undefined,
  context: string,
): Promise<LocalEncryptedSecretEnvelope | undefined> {
  const trimmed = secret?.trim();
  if (!trimmed) return undefined;

  const crypto = getCrypto();
  const { id, key } = await getKeyMaterial();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: encoder.encode(context),
    },
    key,
    encoder.encode(trimmed),
  );

  return {
    v: 1,
    alg: LOCAL_SECRET_ALG,
    keyId: id,
    iv: bytesToBase64Url(iv),
    ciphertext: bytesToBase64Url(arrayBufferToBytes(ciphertext)),
    context,
  };
}

export async function decryptLocalSecret(
  envelope: LocalEncryptedSecretEnvelope | undefined,
  expectedContext: string,
): Promise<string | undefined> {
  if (!envelope) return undefined;
  if (!isLocalEncryptedSecretEnvelope(envelope)) {
    throw new Error("Invalid local secret envelope");
  }
  if (envelope.context !== expectedContext) {
    throw new Error("Local secret context mismatch");
  }

  const crypto = getCrypto();
  const { id, key } = await getKeyMaterial();
  if (envelope.keyId !== id) {
    throw new Error("Local secret key id mismatch");
  }

  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: bytesToArrayBuffer(base64UrlToBytes(envelope.iv)),
      additionalData: new TextEncoder().encode(expectedContext),
    },
    key,
    bytesToArrayBuffer(base64UrlToBytes(envelope.ciphertext)),
  );

  return new TextDecoder().decode(plaintext);
}
