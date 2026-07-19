import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Sidebar composition", () => {
  it("keeps the search trigger in a dedicated component with shared navigation styling", () => {
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
    expect(sidebar).not.toContain("isSearchingChats");
    expect(sidebar).toContain("renderShowAllButton");
    expect(sidebar).toContain("PanelLeftOpen");
    expect(sidebar).toContain("PanelLeftClose");
    expect(sidebar).not.toContain('name="sidebar-chat-search"');
    expect(sidebarSearch).not.toContain('name="sidebar-chat-search"');
    expect(sidebarSearch).toContain("onOpenGlobalSearch");
    expect(sidebarSearch).toContain("isGlobalSearchOpen");
    expect(sidebarSearch).toContain("aria-current={isGlobalSearchOpen");
    expect(sidebarSearch).toContain('t("globalSearch")');
    const navigationItemClasses =
      "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium";
    expect(sidebar).toContain(navigationItemClasses);
    expect(sidebarSearch).toContain(navigationItemClasses);
    expect(sidebarSearch).toContain(
      'isOpen ? "w-full" : "w-10 justify-center px-0"',
    );
    expect(sidebarSearch).not.toContain("<kbd");
    expect(sidebarSearch).not.toContain("⌘/Ctrl K");
  });

  it("defaults workspace chat lists to collapsed without search-only expansion", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(source).toContain("newExpanded[w.id] = false");
    expect(source).toContain("const isExpanded = expandedSections[ws.id]");
    expect(source).not.toContain("isSearchingChats");
    expect(source).not.toContain("newExpanded[w.id] = true");
  });

  it("uses a drawer below the desktop breakpoint and a collapsible desktop rail", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(source).toContain("transition-transform");
    expect(source).toContain("will-change-transform");
    expect(source).toContain("lg:transition-[width,transform]");
    expect(source).toContain('isOpen ? "translate-x-0" : "-translate-x-full"');
    expect(source).toContain('className="flex h-full w-full flex-col"');
    expect(source).toContain("lg:translate-x-0 lg:relative");
    expect(source).toContain('isOpen ? "lg:w-72" : "lg:w-16"');
    expect(source).not.toContain("transition-[width,transform] duration-300");
    expect(source).not.toContain("md:relative md:w-16");
    expect(source).not.toContain('isOpen ? "md:w-72" : "md:w-16"');
  });

  it("renders settings as a dropdown with appearance and language submenus", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(source).toContain("useCoreSettingsStore");
    expect(source).toContain("useSetLocale");
    expect(source).toContain("DropdownMenuRadioGroup");
    expect(source).toContain("DropdownMenuSubTrigger");
    expect(source).toContain("value={theme}");
    expect(source).toContain("value={language}");
    expect(source).toContain("themeDisplayLabel");
    expect(source).toContain("languageDisplayLabel");
    expect(source).toMatch(
      /DropdownMenuRadioItem[\s\S]*indicatorPosition="right"[\s\S]*value="light"/,
    );
    expect(source).toMatch(
      /DropdownMenuRadioItem[\s\S]*indicatorPosition="right"[\s\S]*value="en"/,
    );
    expect(source).toMatch(/onValueChange=\{\(value\) =>[\s\S]*setTheme/);
    expect(source).toMatch(/onValueChange=\{\(value\) =>[\s\S]*setLocale/);
    expect(source).toContain("onSelect={() => onOpenSettings()}");
  });

  it("animates the settings dropdown chevron when the menu opens", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(source).toContain("isSettingsMenuOpen");
    expect(source).toContain("onOpenChange={setIsSettingsMenuOpen}");
    expect(source).toContain("transition-transform");
    expect(source).toContain("rotate-180");
  });
});
