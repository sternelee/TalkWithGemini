import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";
import {
  ensureLegacyGeminiCoreSettingsMigration,
  ensureLegacyGeminiNextChatMigration,
} from "./legacyGeminiMigration";
import { logDevError } from "@/lib/utils/devLogger";
import {
  isAppRestoreHydrationInProgress,
  prepareAppRestoreHydration,
  runWithAppRestoreHydrationWriteLock,
  type AppRestoreDb,
  type AppRestoreSnapshot,
} from "@/lib/data/appRestoreJournal";
import {
  isSessionMessageTree,
  normalizeSessionMessageTree,
} from "@/lib/chat/messageTree";
import { normalizeMessages } from "./migrations";

/**
 * Storage Configuration
 * Unified IndexedDB storage for all application data
 */

// Unified storage with multiple stores
export const appDb = localforage.createInstance({
  name: "neo-chat",
  storeName: "app_data",
  description: "Unified application storage",
});

export const STORAGE_VERSION = 5;
export type StorageVersion = typeof STORAGE_VERSION;

export const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

const SESSION_MESSAGES_PREFIX = "session_messages_";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseStoredValue(value: unknown, label: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`Restored ${label} data is not valid JSON.`);
  }
}

function validatePersistedChatState(value: unknown): void {
  if (value === null || value === undefined) return;
  const persisted = parseStoredValue(value, "chat");
  if (!isRecord(persisted) || !isRecord(persisted.state)) {
    throw new Error("Restored chat data has an invalid persisted state.");
  }

  const sessions = persisted.state.sessions;
  if (sessions !== undefined && !Array.isArray(sessions)) {
    throw new Error("Restored chat sessions must be an array.");
  }
  const sessionIds = new Set<string>();
  for (const session of sessions || []) {
    if (!isRecord(session) || typeof session.id !== "string") {
      throw new Error("Restored chat data contains an invalid session.");
    }
    const id = session.id;
    if (!/^[a-zA-Z0-9._:-]{1,200}$/.test(id) || sessionIds.has(id)) {
      throw new Error(
        "Restored chat data contains an invalid or duplicate session identifier.",
      );
    }
    sessionIds.add(id);
  }

  const currentSessionId = persisted.state.currentSessionId;
  if (
    currentSessionId !== undefined &&
    currentSessionId !== null &&
    (typeof currentSessionId !== "string" || !sessionIds.has(currentSessionId))
  ) {
    throw new Error(
      "Restored chat data points to a session that does not exist.",
    );
  }
}

function validateStoredMessageTree(value: unknown, key: string): void {
  const parsed = parseStoredValue(value, key);
  if (!Array.isArray(parsed) && !isSessionMessageTree(parsed)) {
    throw new Error(`Restored message data in ${key} has an invalid shape.`);
  }
  const isValidMessage = (message: unknown) =>
    isRecord(message) &&
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "model") &&
    typeof message.content === "string";

  if (Array.isArray(parsed)) {
    if (!parsed.every(isValidMessage)) {
      throw new Error(`Restored message data in ${key} is inconsistent.`);
    }
  } else {
    if (
      !parsed.rootMessageIds.every((id) => typeof id === "string") ||
      Object.entries(parsed.nodesById).some(
        ([nodeId, node]) =>
          !isRecord(node) ||
          node.id !== nodeId ||
          !isValidMessage(node.message) ||
          !Array.isArray(node.childMessageIds) ||
          !node.childMessageIds.every((id) => typeof id === "string"),
      )
    ) {
      throw new Error(`Restored message data in ${key} is inconsistent.`);
    }
  }
  const normalized = Array.isArray(parsed)
    ? normalizeSessionMessageTree(normalizeMessages(parsed))
    : normalizeSessionMessageTree(parsed);

  for (const [nodeId, node] of Object.entries(normalized.nodesById)) {
    if (
      node.id !== nodeId ||
      !node.message ||
      typeof node.message.id !== "string" ||
      node.message.id !== nodeId ||
      (node.message.role !== "user" && node.message.role !== "model") ||
      typeof node.message.content !== "string" ||
      !Array.isArray(node.childMessageIds)
    ) {
      throw new Error(`Restored message data in ${key} is inconsistent.`);
    }
  }
}

type AppRestoreValidationDb = AppRestoreDb & {
  keys(): Promise<string[]>;
};

export async function validateRestoredAppData(
  snapshot: AppRestoreSnapshot,
  db: AppRestoreValidationDb = appDb,
): Promise<void> {
  validatePersistedChatState(await db.getItem(STORAGE_KEYS.CHAT));
  const keys = await db.keys();
  const restoredMessageKeys = keys.filter((key) =>
    key.startsWith(SESSION_MESSAGES_PREFIX),
  );
  for (const key of restoredMessageKeys) {
    validateStoredMessageTree(await db.getItem(key), key);
  }

  const unexpectedManagedKey = snapshot.managedDbKeys.find(
    (key) =>
      !Object.values(STORAGE_KEYS).includes(
        key as (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS],
      ) && !key.startsWith(SESSION_MESSAGES_PREFIX),
  );
  if (unexpectedManagedKey) {
    throw new Error("Restore snapshot contains an unsupported storage key.");
  }
}

function prepareBrowserAppRestoreHydration(): Promise<void> | undefined {
  if (typeof window === "undefined") return undefined;

  return prepareAppRestoreHydration({
    db: appDb,
    localStorageRef: window.localStorage,
    deleteOpfsUrl: async (url) => {
      const { deleteFromOPFS } = await import("@/utils/opfs");
      await deleteFromOPFS(url);
    },
    validateRestoredData: validateRestoredAppData,
  });
}

export const getAppDbStorage = (): StateStorage => {
  if (typeof window === "undefined") return noopStorage;
  return {
    getItem: async (name) => {
      await prepareBrowserAppRestoreHydration();
      if (!isAppRestoreHydrationInProgress()) {
        try {
          await ensureLegacyGeminiNextChatMigration({
            targetDb: appDb,
            localStorageRef: window.localStorage,
            storageKeys: STORAGE_KEYS,
          });
        } catch (error) {
          logDevError("Legacy Gemini data migration failed:", error);
        }
      }
      return appDb.getItem<string>(name);
    },
    setItem: (name, value) =>
      runWithAppRestoreHydrationWriteLock(() => appDb.setItem(name, value)),
    removeItem: (name) =>
      runWithAppRestoreHydrationWriteLock(() => appDb.removeItem(name)),
  };
};

export const getBrowserLocalStorage = (): StateStorage => {
  if (typeof window === "undefined") return noopStorage;
  const readItem = (name: string) => {
    if (!isAppRestoreHydrationInProgress()) {
      try {
        ensureLegacyGeminiCoreSettingsMigration({
          localStorageRef: window.localStorage,
          storageKeys: STORAGE_KEYS,
        });
      } catch (error) {
        logDevError("Legacy Gemini core settings migration failed:", error);
      }
    }
    return window.localStorage.getItem(name);
  };

  return {
    getItem: (name) => {
      const preparation = prepareBrowserAppRestoreHydration();
      return preparation
        ? preparation.then(() => readItem(name))
        : readItem(name);
    },
    setItem: (name, value) =>
      runWithAppRestoreHydrationWriteLock(async () => {
        window.localStorage.setItem(name, value);
      }),
    removeItem: (name) =>
      runWithAppRestoreHydrationWriteLock(async () => {
        window.localStorage.removeItem(name);
      }),
  };
};

// Storage keys
export const STORAGE_KEYS = {
  // Core settings (localStorage via zustand default)
  CORE_SETTINGS: "neo-chat-core-settings",

  // Store names (IndexedDB)
  SETTINGS: "neo-chat-settings",
  CHAT: "neo-chat-storage",
  KNOWLEDGE: "knowledge-storage",
  MEMORY: "neo-chat-memory",
} as const;
