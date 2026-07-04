import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Sidebar composition", () => {
  it("keeps search/filter UI in a dedicated component", () => {
    const sidebar = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );
    const sidebarSearch = readFileSync(
      resolve(process.cwd(), "src/components/layout/SidebarSearch.tsx"),
      "utf8",
    );

    expect(sidebar).toContain("SidebarSearch");
    expect(sidebar).toContain("WORKSPACE_SESSION_PREVIEW_LIMIT = 5");
    expect(sidebar).toContain("ROOT_SESSION_PREVIEW_LIMIT = 5");
    expect(sidebar).toContain("expandedWorkspaceSessionLists");
    expect(sidebar).toContain("expandedRootSessionLists");
    expect(sidebar).not.toContain("const [expandedRootSessionList,");
    expect(sidebar).toContain("isSearchingChats");
    expect(sidebar).toContain("renderShowAllButton");
    expect(sidebar).toContain("PanelLeftOpen");
    expect(sidebar).toContain("PanelLeftClose");
    expect(sidebar).not.toContain('name="sidebar-chat-search"');
    expect(sidebarSearch).toContain('name="sidebar-chat-search"');
    expect(sidebarSearch).toContain("onCollapsedSearchClick");
  });

  it("defaults workspace chat lists to collapsed while search expands matches", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(source).toContain("newExpanded[w.id] = false");
    expect(source).toContain("isSearchingChats || expandedSections[ws.id]");
    expect(source).not.toContain("newExpanded[w.id] = true");
  });
});
