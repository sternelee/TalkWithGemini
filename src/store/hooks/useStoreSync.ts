import { useEffect } from "react";
import { useChatStore } from "../core/chatStore";

/**
 * Hook to automatically sync active session to storage
 * Useful for components that frequently update messages
 */
export const useAutoSyncSession = (enabled: boolean = true) => {
  const syncActiveSession = useChatStore((state) => state.syncActiveSession);
  const currentSessionId = useChatStore((state) => state.currentSessionId);

  useEffect(() => {
    if (!enabled || !currentSessionId) return;

    // Sync on unmount or when session changes
    return () => {
      syncActiveSession(currentSessionId);
    };
  }, [currentSessionId, enabled, syncActiveSession]);
};

/**
 * Hook to debounce store updates
 * Useful for expensive operations like saving to IndexedDB
 */
export const useDebouncedSync = (
  callback: () => void | Promise<void>,
  delay: number = 1000,
) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      callback();
    }, delay);

    return () => clearTimeout(timer);
  }, [callback, delay]);
};
