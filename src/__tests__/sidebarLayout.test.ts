import { describe, expect, it } from "vitest";

import { calculateSidebarPaneHeights } from "../components/layout/sidebarLayout";

describe("calculateSidebarPaneHeights", () => {
  it("lets a small workspace pane leave the rest to chat", () => {
    const result = calculateSidebarPaneHeights({
      availableHeight: 1000,
      workspaceContentHeight: 100,
      chatContentHeight: 1200,
    });

    expect(result.workspace).toBe(100);
    expect(result.chat).toBe(900);
  });

  it("lets a small chat pane leave the rest to workspaces", () => {
    const result = calculateSidebarPaneHeights({
      availableHeight: 1000,
      workspaceContentHeight: 1200,
      chatContentHeight: 200,
    });

    expect(result.workspace).toBe(800);
    expect(result.chat).toBe(200);
  });

  it("caps both overflowing panes at half the available area", () => {
    const result = calculateSidebarPaneHeights({
      availableHeight: 1000,
      workspaceContentHeight: 900,
      chatContentHeight: 1200,
    });

    expect(result.workspace).toBe(500);
    expect(result.chat).toBe(500);
  });

  it("subtracts the pane gap from the available height", () => {
    const result = calculateSidebarPaneHeights({
      availableHeight: 1000,
      workspaceContentHeight: 100,
      chatContentHeight: 1200,
      gap: 24,
    });

    expect(result.workspace).toBe(100);
    expect(result.chat).toBe(876);
    expect(result.workspace + result.chat + 24).toBe(1000);
  });
});
