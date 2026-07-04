/**
 * Store Index
 * Centralized exports for all stores and utilities
 */

// Core Stores
export { useChatStore } from "./core/chatStore";
export { useSettingsStore } from "./core/settingsStore";
export { useCoreSettingsStore } from "./core/coreSettingsStore";
export { useKnowledgeStore } from "./core/knowledgeStore";
export { useUIStore } from "./core/uiStore";
export { useMemoryStore } from "./core/memoryStore";

// Storage Configuration
export { appDb, STORAGE_KEYS } from "./storage/storageConfig";

// Custom Hooks - Hydration
export { useStoreHydration, useStoreReady } from "./hooks/useHydration";
export { useAutoSyncSession, useDebouncedSync } from "./hooks/useStoreSync";

// Custom Hooks - SSR Safe
export {
  useStoreWithSSR,
  useIsClient,
  useHydratedStore,
} from "./hooks/useStoreWithSSR";

// Custom Hooks - Optimized with useShallow
export {
  // Chat Store
  useChatSession,
  useChatActions,
  useChatMessages,
  useChatConfig,
  useChatWorkspaces,
  // Settings Store
  useThemeSettings,
  useProviderSettings,
  useDefaultModels,
  useModelMetadata,
  usePluginSettings,
  useAgentSettings,
  useSystemSettings,
  useSearchSettings,
  useRAGSettings,
  useVoiceSettings,
  // Knowledge Store
  useKnowledgeCollections,
  useKnowledgeFiles,
  // UI Store
  useImagePreview,
} from "./hooks/useShallowStore";

// Utility Functions
export {
  formatModelName,
  getEffectiveBaseUrl,
  getTaskModel,
} from "./core/settingsStore";
