import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function readProjectFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("dark theme token contract", () => {
  it("exposes shadcn-style semantic color utilities and Neo brand tokens", () => {
    const globals = readProjectFile("src/app/globals.css");

    for (const token of [
      "--color-card: var(--card);",
      "--color-popover: var(--popover);",
      "--color-muted: var(--muted);",
      "--color-accent: var(--accent);",
      "--color-border: var(--border);",
      "--color-input: var(--input);",
      "--color-ring: var(--ring);",
      "--color-sidebar: var(--sidebar);",
      "--color-brand: var(--brand);",
    ]) {
      expect(globals).toContain(token);
    }

    expect(globals).toContain("--brand:");
    expect(globals).toContain("--brand-foreground:");
    expect(globals).toContain("--brand-soft:");
    expect(globals).toContain(".glass-shell");
    expect(globals).toContain(".glass-popover");
  });

  it("does not use the legacy GitHub dark color as the app dark base", () => {
    const files = [
      "src/app/globals.css",
      "src/app/layout.tsx",
      "src/app/manifest.ts",
      "src/app/loading.tsx",
      "src/app/error.tsx",
      "src/components/app/ChatApp.tsx",
      "src/components/app/AccessPasswordPage.tsx",
      "tailwind.config.ts",
    ];

    for (const file of files) {
      const contents = readProjectFile(file);
      expect(contents, file).not.toMatch(/#0d1117|#0a0a0a|gray:\s*\{/);
    }
  });

  it("uses system font stacks instead of next/font generated variables", () => {
    const layout = readProjectFile("src/app/layout.tsx");
    const globals = readProjectFile("src/app/globals.css");

    expect(layout).not.toMatch(/next\/font/);
    expect(layout).not.toMatch(/font-geist/);
    expect(globals).not.toMatch(/font-geist/);
    expect(globals).toContain(
      "--font-sans: ui-sans-serif, system-ui, sans-serif;",
    );
    expect(globals).toMatch(
      /--font-mono:\s*ui-monospace,\s*SFMono-Regular,\s*"SF Mono",\s*Consolas,\s*"Liberation Mono",\s*Menlo,\s*monospace;/,
    );
  });
});
