import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GLOBAL_SEARCH_ADVANCED_OPTIONS,
  getGlobalSearchAdvancedOptionCount,
  getGlobalSearchViewState,
  resetGlobalSearchViewState,
  updateGlobalSearchViewState,
} from "../lib/global-search/viewState";

describe("global search view state", () => {
  afterEach(() => resetGlobalSearchViewState());

  it("retains the query, filters, and sort across panel instances", () => {
    updateGlobalSearchViewState({
      query: "本地知识",
      source: "knowledge",
      workspaceId: "workspace-1",
      role: "model",
      date: "30",
      sort: "newest",
    });

    // A newly mounted panel reads the same module-scoped application state.
    expect(getGlobalSearchViewState()).toEqual({
      query: "本地知识",
      source: "knowledge",
      workspaceId: "workspace-1",
      role: "model",
      date: "30",
      sort: "newest",
    });
  });

  it("does not expose mutable state references", () => {
    const first = getGlobalSearchViewState();
    first.query = "mutated outside";

    expect(getGlobalSearchViewState().query).toBe("");
  });

  it("counts only non-default advanced options", () => {
    expect(getGlobalSearchAdvancedOptionCount(getGlobalSearchViewState())).toBe(
      0,
    );

    const updated = updateGlobalSearchViewState({
      query: "active branch",
      source: "knowledge",
      workspaceId: "workspace-1",
      role: "model",
      date: "30",
      sort: "newest",
    });

    expect(getGlobalSearchAdvancedOptionCount(updated)).toBe(4);
  });

  it("restores advanced defaults without clearing the source or query", () => {
    updateGlobalSearchViewState({
      query: "local data",
      source: "memory",
      workspaceId: "workspace-1",
      role: "user",
      date: "7",
      sort: "oldest",
    });

    const restored = updateGlobalSearchViewState(
      DEFAULT_GLOBAL_SEARCH_ADVANCED_OPTIONS,
    );

    expect(restored).toEqual({
      query: "local data",
      source: "memory",
      ...DEFAULT_GLOBAL_SEARCH_ADVANCED_OPTIONS,
    });
    expect(getGlobalSearchAdvancedOptionCount(restored)).toBe(0);
  });
});
