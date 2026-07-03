import { useMemo } from "react";
import { useStore } from "zustand";
import { useChatStore } from "../core/chatStore";
import { useSettingsStore } from "../core/settingsStore";
import { useKnowledgeStore } from "../core/knowledgeStore";

/**
 * Hook to check if all stores have been hydrated
 * Useful for preventing flash of incorrect content during SSR/hydration
 *
 * Uses zustand's useStore hook to safely access store state during SSR
 */
export const useStoreHydration = () => {
  // Use useStore for SSR-safe access
  const chatHydrated = useStore(useChatStore, (state) => state._hasHydrated);
  const settingsHydrated = useStore(
    useSettingsStore,
    (state) => state._hasHydrated,
  );
  const knowledgeHydrated = useStore(
    useKnowledgeStore,
    (state) => state._hasHydrated,
  );

  // Use useMemo to compute derived state instead of useState + useEffect
  const isHydrated = useMemo(() => {
    return chatHydrated && settingsHydrated && knowledgeHydrated;
  }, [chatHydrated, settingsHydrated, knowledgeHydrated]);

  return {
    isHydrated,
    chatHydrated,
    settingsHydrated,
    knowledgeHydrated,
  };
};

/**
 * Hook to wait for a specific store to hydrate
 * Uses zustand's useStore for SSR-safe access
 */
export const useStoreReady = (
  storeName: "chat" | "settings" | "knowledge",
): boolean => {
  const chatHydrated = useStore(useChatStore, (state) => state._hasHydrated);
  const settingsHydrated = useStore(
    useSettingsStore,
    (state) => state._hasHydrated,
  );
  const knowledgeHydrated = useStore(
    useKnowledgeStore,
    (state) => state._hasHydrated,
  );

  switch (storeName) {
    case "chat":
      return chatHydrated;
    case "settings":
      return settingsHydrated;
    case "knowledge":
      return knowledgeHydrated;
    default:
      return false;
  }
};
