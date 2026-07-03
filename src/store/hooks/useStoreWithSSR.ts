import { useSyncExternalStore } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand";

/**
 * SSR-safe wrapper for zustand stores
 *
 * This hook ensures that store values are only accessed after hydration,
 * preventing hydration mismatches between server and client.
 *
 * Uses useSyncExternalStore for proper SSR handling without triggering
 * React compiler warnings.
 *
 * @param store - Zustand store
 * @param selector - State selector function
 * @param serverFallback - Fallback value to use during SSR
 * @returns Selected state value (fallback during SSR, actual value after hydration)
 *
 * @example
 * ```tsx
 * const theme = useStoreWithSSR(
 *   useCoreSettingsStore,
 *   (state) => state.theme,
 *   'system' // fallback value
 * );
 * ```
 */
export function useStoreWithSSR<T, U>(
  store: StoreApi<T>,
  selector: (state: T) => U,
  serverFallback: U,
): U {
  const value = useStore(store, selector);

  // Use useSyncExternalStore to safely handle SSR
  // This returns false on server, true on client after hydration
  const isClient = useSyncExternalStore(
    () => () => {}, // subscribe (no-op, never changes)
    () => true, // getSnapshot (client-side)
    () => false, // getServerSnapshot (server-side)
  );

  // Return fallback during SSR, actual value after hydration
  return isClient ? value : serverFallback;
}

/**
 * Hook to check if we're running on the client side
 * Useful for conditional rendering based on hydration status
 *
 * Uses useSyncExternalStore for SSR-safe client detection
 * without triggering React compiler warnings.
 */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {}, // subscribe (no-op, never changes)
    () => true, // getSnapshot (client-side)
    () => false, // getServerSnapshot (server-side)
  );
}

/**
 * Hook to safely access store state with hydration check
 *
 * Returns undefined until the store is hydrated, preventing
 * hydration mismatches and flash of incorrect content.
 *
 * @example
 * ```tsx
 * const sessions = useHydratedStore(
 *   useChatStore,
 *   (state) => state.sessions,
 *   (state) => state._hasHydrated
 * );
 *
 * if (!sessions) {
 *   return <LoadingSpinner />;
 * }
 * ```
 */
export function useHydratedStore<T, U>(
  store: StoreApi<T>,
  selector: (state: T) => U,
  hydratedSelector: (state: T) => boolean,
): U | undefined {
  const isHydrated = useStore(store, hydratedSelector);
  const value = useStore(store, selector);

  return isHydrated ? value : undefined;
}
