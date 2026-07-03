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
});
