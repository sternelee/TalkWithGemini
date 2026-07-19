import type {
  GlobalSearchRole,
  GlobalSearchSort,
  GlobalSearchSource,
} from "./types";

export type GlobalSearchSourceFilter = "all" | GlobalSearchSource;
export type GlobalSearchRoleFilter = "all" | GlobalSearchRole;
export type GlobalSearchDateFilter = "all" | "7" | "30" | "90";

export interface GlobalSearchViewState {
  query: string;
  source: GlobalSearchSourceFilter;
  workspaceId: string;
  role: GlobalSearchRoleFilter;
  date: GlobalSearchDateFilter;
  sort: GlobalSearchSort;
}

export const DEFAULT_GLOBAL_SEARCH_ADVANCED_OPTIONS: Pick<
  GlobalSearchViewState,
  "workspaceId" | "role" | "date" | "sort"
> = {
  workspaceId: "all",
  role: "all",
  date: "all",
  sort: "relevance",
};

const DEFAULT_VIEW_STATE: GlobalSearchViewState = {
  query: "",
  source: "all",
  ...DEFAULT_GLOBAL_SEARCH_ADVANCED_OPTIONS,
};

export function getGlobalSearchAdvancedOptionCount(
  state: GlobalSearchViewState,
): number {
  return (
    Number(state.workspaceId !== "all") +
    Number(state.role !== "all") +
    Number(state.date !== "all") +
    Number(state.sort !== "relevance")
  );
}

// Intentionally module-scoped: it survives panel unmount/remount but is never
// serialized to the URL or browser storage.
let currentViewState: GlobalSearchViewState = { ...DEFAULT_VIEW_STATE };

export function getGlobalSearchViewState(): GlobalSearchViewState {
  return { ...currentViewState };
}

export function updateGlobalSearchViewState(
  updates: Partial<GlobalSearchViewState>,
): GlobalSearchViewState {
  currentViewState = { ...currentViewState, ...updates };
  return getGlobalSearchViewState();
}

export function resetGlobalSearchViewState(): GlobalSearchViewState {
  currentViewState = { ...DEFAULT_VIEW_STATE };
  return getGlobalSearchViewState();
}
