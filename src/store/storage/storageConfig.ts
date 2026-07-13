import localforage from "localforage";
import type { StateStorage } from "zustand/middleware";
import {
  ensureLegacyGeminiCoreSettingsMigration,
  ensureLegacyGeminiNextChatMigration,
} from "./legacyGeminiMigration";
import { logDevError } from "@/lib/utils/devLogger";

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

export const STORAGE_VERSION = 4;
export type StorageVersion = typeof STORAGE_VERSION;

export const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

export const getAppDbStorage = (): StateStorage => {
  if (typeof window === "undefined") return noopStorage;
  return {
    getItem: async (name) => {
      try {
        await ensureLegacyGeminiNextChatMigration({
          targetDb: appDb,
          localStorageRef: window.localStorage,
          storageKeys: STORAGE_KEYS,
        });
      } catch (error) {
        logDevError("Legacy Gemini data migration failed:", error);
      }
      return appDb.getItem<string>(name);
    },
    setItem: (name, value) => appDb.setItem(name, value),
    removeItem: (name) => appDb.removeItem(name),
  };
};

export const getBrowserLocalStorage = (): StateStorage => {
  if (typeof window === "undefined") return noopStorage;
  return {
    getItem: (name) => {
      try {
        ensureLegacyGeminiCoreSettingsMigration({
          localStorageRef: window.localStorage,
          storageKeys: STORAGE_KEYS,
        });
      } catch (error) {
        logDevError("Legacy Gemini core settings migration failed:", error);
      }
      return window.localStorage.getItem(name);
    },
    setItem: (name, value) => window.localStorage.setItem(name, value),
    removeItem: (name) => window.localStorage.removeItem(name),
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
