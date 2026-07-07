import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("chat shell accessibility", () => {
  it("provides a skip link to the main chat region", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );
    const globals = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(chatApp).toContain('href="#main-chat"');
    expect(chatApp).toContain('id="main-chat"');
    expect(globals).toContain(".skip-link");
  });

  it("accounts for mobile safe areas in fixed app chrome", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(chatApp).toContain("env(safe-area-inset-bottom)");
    expect(sidebar).toContain("env(safe-area-inset-top)");
    expect(sidebar).toContain("env(safe-area-inset-bottom)");
  });

  it("isolates the main chat region while the non-desktop sidebar drawer is open", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(chatApp).toContain("isNonDesktopViewport");
    expect(chatApp).toContain("window.innerWidth < 1024");
    expect(chatApp).toContain(
      "const isSidebarDrawerOpen = isSidebarOpen && isNonDesktopViewport",
    );
    expect(chatApp).toContain("md:pl-16 lg:pl-0");
    expect(chatApp).not.toContain("backdrop-blur-[1px]");
    expect(chatApp).toContain("mainInertProps");
    expect(chatApp).toContain("inert");
    expect(chatApp).toContain("aria-hidden");
    expect(sidebar).toContain('role={isModal ? "dialog" : undefined}');
    expect(sidebar).toContain("aria-modal={isModal || undefined}");
    expect(sidebar).toContain("handleSidebarKeyDown");
    expect(sidebar).toContain("restoreFocusRef");
  });

  it("keeps mobile header icon buttons keyboard-focus visible", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );

    expect(chatApp).toContain(
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    );
    expect(chatApp).toContain(
      '<MessageSquarePlus size={16} aria-hidden="true" />',
    );
  });

  it("contains workspace settings scrolling on small viewports", () => {
    const modal = readFileSync(
      resolve(
        process.cwd(),
        "src/components/layout/WorkspaceSettingsModal.tsx",
      ),
      "utf8",
    );

    expect(modal).toContain("document.body.style.overflow");
    expect(modal).toContain("100dvh");
    expect(modal).toContain("overscroll-contain");
    expect(modal).toContain("env(safe-area-inset-bottom)");
    expect(modal).toContain("min-w-0 truncate");
    expect(modal).toContain("title={plugin.title}");
    expect(modal).toContain("title={col.name}");
  });
});
