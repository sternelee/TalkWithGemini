import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("dropdown menu composition", () => {
  it("uses a local Radix dropdown-menu wrapper", () => {
    const packageJson = JSON.parse(read("package.json")) as {
      dependencies?: Record<string, string>;
    };
    const wrapperPath = "src/components/ui/dropdown-menu.tsx";

    expect(packageJson.dependencies).toHaveProperty(
      "@radix-ui/react-dropdown-menu",
    );
    expect(existsSync(resolve(process.cwd(), wrapperPath))).toBe(true);

    const wrapper = read(wrapperPath);
    expect(wrapper).toContain('from "@radix-ui/react-dropdown-menu"');
    expect(wrapper).toContain("DropdownMenuContent");
    expect(wrapper).toContain("DropdownMenuItem");
    expect(wrapper).toContain("DropdownMenuCheckboxItem");
    expect(wrapper).toContain("DropdownMenuRadioItem");
    expect(wrapper).toContain("DropdownMenuSeparator");
    expect(wrapper).toContain("DropdownMenuLabel");
    expect(wrapper).toContain("data-[side=bottom]");
    expect(wrapper).toContain("collisionPadding");
    expect(wrapper).toContain('variant?: "default" | "destructive"');
  });

  it("migrates high-priority action menus away from AnchoredPortal menu markup", () => {
    const actionMenuFiles = [
      "src/components/chat/MessageInput.tsx",
      "src/components/chat/MessageItem.tsx",
      "src/components/content/Artifact.tsx",
      "src/components/modals/RemoteFileModal.tsx",
      "src/components/assistant/AssistantHub.tsx",
      "src/components/plugin/PluginMarket.tsx",
      "src/components/layout/Sidebar.tsx",
    ];

    for (const file of actionMenuFiles) {
      const source = read(file);
      expect(source, file).toContain("components/ui/dropdown-menu");
      expect(source, file).not.toContain('role="menu"');
      expect(source, file).not.toContain('role="menuitem"');
      expect(source, file).not.toContain('role="menuitemcheckbox"');
      expect(source, file).not.toContain('role="menuitemradio"');
    }
  });

  it("wires the about settings tab to a product-info layout", () => {
    const panelState = read("src/lib/chat/panelUrlState.ts");
    const settingsPage = read("src/components/settings/SettingsPage.tsx");
    const aboutSettings = read("src/components/settings/AboutSettings.tsx");

    expect(panelState).toContain('"about"');
    expect(settingsPage).toContain("AboutSettings");
    expect(settingsPage).toContain('id: "about"');
    expect(aboutSettings).toContain("aboutHero");
    expect(aboutSettings).toContain("aboutProductInfo");
    expect(aboutSettings).toContain("https://neo.u14.app");
    expect(aboutSettings).toContain("https://github.com/u14app/neo-chat");
    expect(aboutSettings).not.toContain('label: t("copyright")');
    expect(aboutSettings).not.toContain('label: t("client")');
    expect(aboutSettings).not.toContain("configuredSiteUrl");
    expect(aboutSettings).not.toContain("runtimeOrigin");
    expect(aboutSettings).toContain("MIT License");
  });
});
