import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("chat shell accessibility", () => {
  it("provides a skip link to the main chat region", () => {
    const chatShell = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatAppShell.tsx"),
      "utf8",
    );
    const globals = readFileSync(
      resolve(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    expect(chatShell).toContain('href="#main-chat"');
    expect(chatShell).toContain('id="main-chat"');
    expect(globals).toContain(".skip-link");
  });

  it("accounts for mobile safe areas in fixed app chrome", () => {
    const chatShell = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatAppShell.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(chatShell).toContain("env(safe-area-inset-bottom)");
    expect(sidebar).toContain("env(safe-area-inset-top)");
    expect(sidebar).toContain("env(safe-area-inset-bottom)");
  });

  it("isolates the main chat region while the non-desktop sidebar drawer is open", () => {
    const chatShell = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatAppShell.tsx"),
      "utf8",
    );
    const panelNavigation = readFileSync(
      resolve(
        process.cwd(),
        "src/features/chat/hooks/useChatPanelNavigation.ts",
      ),
      "utf8",
    );
    const sidebar = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(panelNavigation).toContain("isNonDesktopViewport");
    expect(panelNavigation).toContain("window.innerWidth < 1024");
    expect(panelNavigation).toContain(
      "const isSidebarDrawerOpen = isSidebarOpen && isNonDesktopViewport",
    );
    expect(chatShell).toContain("md:pl-16 lg:pl-0");
    expect(chatShell).not.toContain("backdrop-blur-[1px]");
    expect(panelNavigation).toContain("mainInertProps");
    expect(panelNavigation).toContain("inert");
    expect(panelNavigation).toContain("aria-hidden");
    expect(sidebar).toContain('role={isModal ? "dialog" : undefined}');
    expect(sidebar).toContain("aria-modal={isModal || undefined}");
    expect(sidebar).toContain("handleSidebarKeyDown");
    expect(sidebar).toContain("restoreFocusRef");
  });

  it("keeps mobile header icon buttons keyboard-focus visible", () => {
    const chatShell = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatAppShell.tsx"),
      "utf8",
    );

    expect(chatShell).toContain(
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    );
    expect(chatShell).toContain(
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

  it("uses shared modal containment for image preview", () => {
    const imagePreview = readFileSync(
      resolve(process.cwd(), "src/components/media/ImagePreview.tsx"),
      "utf8",
    );

    expect(imagePreview).toContain("useModalLifecycle");
    expect(imagePreview).toContain("trapModalFocus");
    expect(imagePreview).toContain("overscroll-contain");
    expect(imagePreview).toContain("env(safe-area-inset-bottom)");
    expect(imagePreview).toContain('e.key === "ArrowRight"');
    expect(imagePreview).toContain('e.key === "ArrowLeft"');
  });

  it("does not hide composer mode changes behind mouse-only gestures", () => {
    const messageInput = readFileSync(
      resolve(process.cwd(), "src/components/chat/MessageInput.tsx"),
      "utf8",
    );
    const voiceButtonSection = messageInput.slice(
      messageInput.indexOf("stopRecordingAria"),
      messageInput.indexOf(
        "</Tooltip>",
        messageInput.indexOf("stopRecordingAria"),
      ),
    );

    expect(voiceButtonSection).not.toContain("onContextMenu");
    expect(voiceButtonSection).not.toContain(
      "autoTranscribe: !voice.autoTranscribe",
    );
  });

  it("keeps searchable unavailable reasons reachable to assistive tech", () => {
    const messageInput = readFileSync(
      resolve(process.cwd(), "src/components/chat/MessageInput.tsx"),
      "utf8",
    );
    const searchButtonSection = messageInput.slice(
      messageInput.indexOf("{/* Search Button */}"),
      messageInput.indexOf("{/* File Upload Button */}"),
    );

    expect(searchButtonSection).not.toContain("aria-disabled");
    expect(searchButtonSection).toContain("getSearchUnavailableMessage");
  });

  it("does not force mobile keyboards open when editing an old message", () => {
    const userMessageEditor = readFileSync(
      resolve(process.cwd(), "src/components/chat/UserMessageEditor.tsx"),
      "utf8",
    );

    expect(userMessageEditor).not.toContain("autoFocus");
    expect(userMessageEditor).toContain("preventScroll");
  });
});
