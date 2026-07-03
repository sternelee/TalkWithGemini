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

  it("isolates the main chat region while the mobile sidebar drawer is open", () => {
    const chatApp = readFileSync(
      resolve(process.cwd(), "src/components/app/ChatApp.tsx"),
      "utf8",
    );
    const sidebar = readFileSync(
      resolve(process.cwd(), "src/components/layout/Sidebar.tsx"),
      "utf8",
    );

    expect(chatApp).toContain("mainInertProps");
    expect(chatApp).toContain("inert");
    expect(chatApp).toContain("aria-hidden");
    expect(sidebar).toContain('role={isModal ? "dialog" : undefined}');
    expect(sidebar).toContain("aria-modal={isModal || undefined}");
    expect(sidebar).toContain("handleSidebarKeyDown");
    expect(sidebar).toContain("restoreFocusRef");
  });
});
