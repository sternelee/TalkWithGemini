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
    expect(globals).toContain("--html-visual-surface:");
    expect(globals).toContain("--html-visual-foreground:");
    expect(globals).toContain("--html-visual-on-light:");
    expect(globals).toContain("--html-visual-on-dark:");
    expect(globals).toContain("--html-visual-border:");
    expect(globals).toContain("--html-visual-subtle-border:");
    expect(globals).toContain("--html-visual-shadow:");
    for (const tone of ["info", "knowledge", "success", "warning", "danger"]) {
      expect(globals).toContain(`--html-visual-${tone}-surface:`);
      expect(globals).toContain(`--html-visual-${tone}-foreground:`);
      expect(globals).toContain(`--html-visual-${tone}-border:`);
      expect(globals).toContain(`--html-visual-${tone}-accent:`);
    }
    expect(globals).toContain(".markdown-html-visual");
    expect(globals).toContain(".glass-shell");
    expect(globals).toContain(".glass-popover");
  });

  it("keeps diagram render containers borderless in normal and enhanced modes", () => {
    const globals = readProjectFile("src/app/globals.css");

    expect(globals).toMatch(
      /\.markdown-diagram-body\s*\{[^}]*border:\s*0;/u,
    );
    expect(globals).not.toMatch(
      /\.markdown-diagram-body\s*\{[^}]*border:\s*1px/u,
    );
    expect(globals).not.toMatch(
      /\.markdown-diagram-enhanced \.markdown-diagram-body\s*\{[^}]*box-shadow/u,
    );
  });

  it("defines passive inline SVG diagrams and fullscreen zoom surfaces", () => {
    const globals = readProjectFile("src/app/globals.css");

    expect(globals).toContain(".markdown-diagram-viewport");
    expect(globals).toContain(".markdown-diagram-zoom-controls");
    expect(globals).toContain(".markdown-diagram-svg-static");
    expect(globals).toMatch(
      /\.markdown-diagram-svg-static\s*\{[^}]*pointer-events:\s*none;/u,
    );
    expect(globals).toContain(".markdown-diagram-svg-interactive");
    expect(globals).toMatch(
      /\.markdown-diagram-svg-interactive\s*\{[^}]*width:\s*max-content;/u,
    );
    expect(globals).toMatch(
      /\.markdown-diagram-transform-wrapper\s*\{[^}]*height:\s*100% !important;/u,
    );
    expect(globals).toMatch(
      /\.markdown-diagram-transform-content\s*\{[^}]*width:\s*max-content;/u,
    );
    expect(globals).toMatch(
      /\.markdown-diagram-fullscreen \.markdown-diagram-svg svg\s*\{[^}]*max-height:\s*none;/u,
    );
    expect(globals).not.toContain(".markdown-mindmap-exporter");
  });

  it("uses direct mindmap SVG export and the shared SVG diagram viewer", () => {
    const renderer = readProjectFile(
      "src/components/content/MarkdownRenderer.tsx",
    );

    expect(renderer).toContain("react-zoom-pan-pinch");
    expect(renderer).toContain("TransformWrapper");
    expect(renderer).toContain("TransformComponent");
    expect(renderer).toContain("DiagramSvgView");
    expect(renderer).toContain("normalizeMermaidSvg");
    expect(renderer).toContain('preserveAspectRatio",');
    expect(renderer).toContain("centerView(1, 0)");
    expect(renderer).toContain("limitToBounds={false}");
    expect(renderer).toContain("exportMindMapToSVG");
    expect(renderer).toContain("data-diagram-display-mode");
    expect(renderer).toMatch(/kind="mermaid"\s+mode=\{mode\}/u);
    expect(renderer).toMatch(/kind="mindmap"\s+mode=\{mode\}/u);
    expect(renderer).toContain('mode="fullscreen"');
    expect(renderer).toContain('mode="inline"');
    expect(renderer).not.toContain("exportToSVG");
    expect(renderer).not.toContain("MindMapRef");
    expect(renderer).not.toContain("markdown-mindmap-exporter");
    expect(renderer).not.toContain("@xiangfa/mindmap/viewer");
    expect(renderer).not.toContain("MindMapViewer");
  });

  it("keeps HTML visual scope structural instead of framed", () => {
    const globals = readProjectFile("src/app/globals.css");

    expect(globals).toMatch(
      /\.markdown-html-visual\s*\{[^}]*color:\s*inherit;[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*box-shadow:\s*none;/u,
    );
    expect(globals).toMatch(
      /\.markdown-body :where\(\.markdown-table-wrap\)\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/u,
    );
    expect(globals).not.toContain(
      ".markdown-html-visual :where(table) {\n  border-color:",
    );
  });

  it("anchors Markdown, diagram, and HTML visual colors to fixed Tailwind scales", () => {
    const globals = readProjectFile("src/app/globals.css");
    const renderer = readProjectFile(
      "src/components/content/MarkdownRenderer.tsx",
    );

    for (const token of [
      "--html-visual-surface: #f8fafc;",
      "--html-visual-foreground: #0f172a;",
      "--html-visual-border: #e2e8f0;",
      "--html-visual-subtle-border: #e5e7eb;",
      "--html-visual-info-surface: #eff6ff;",
      "--html-visual-info-foreground: #1d4ed8;",
      "--html-visual-info-border: #bfdbfe;",
      "--html-visual-knowledge-surface: #faf5ff;",
      "--html-visual-knowledge-foreground: #7e22ce;",
      "--html-visual-success-surface: #f0fdf4;",
      "--html-visual-success-foreground: #15803d;",
      "--html-visual-warning-surface: #fffbeb;",
      "--html-visual-warning-foreground: #b45309;",
      "--html-visual-danger-surface: #fff1f2;",
      "--html-visual-danger-foreground: #be123c;",
      "--diagram-root-bg: #fef2f2;",
      "--diagram-root-text: #7f1d1d;",
      "--diagram-line: #ef4444;",
      "--html-visual-surface: #18181b;",
      "--html-visual-foreground: #f8fafc;",
      "--html-visual-info-surface: rgb(30 58 138 / 0.24);",
      "--html-visual-info-foreground: #bfdbfe;",
      "--html-visual-knowledge-surface: rgb(88 28 135 / 0.24);",
      "--html-visual-knowledge-foreground: #e9d5ff;",
      "--html-visual-success-surface: rgb(20 83 45 / 0.22);",
      "--html-visual-warning-surface: rgb(120 53 15 / 0.24);",
      "--html-visual-danger-surface: rgb(136 19 55 / 0.26);",
      "--diagram-root-bg: #450a0a;",
      "--diagram-root-text: #fee2e2;",
    ]) {
      expect(globals).toContain(token);
    }

    expect(renderer).toContain('primaryColor: dark ? "#450a0a" : "#fef2f2"');
    expect(renderer).toContain('lineColor: dark ? "#f87171" : "#dc2626"');
  });

  it("keeps MarkdownRenderer color styling on semantic CSS classes", () => {
    const renderer = readProjectFile(
      "src/components/content/MarkdownRenderer.tsx",
    );

    expect(renderer).not.toContain("highlight.js/styles/github-dark.min.css");
    expect(renderer).toContain('className="markdown-citation-card"');
    expect(renderer).toContain('className="markdown-file-card-icon"');
    expect(renderer).toContain("markdown-codeblock");
    expect(renderer).toContain("markdown-console");
    expect(renderer).not.toMatch(
      /\b(?:text|bg|border|from|to|fill|shadow)-(?:gray|slate|zinc|red|rose|blue|purple|green|amber|yellow|violet)-/u,
    );
  });

  it("defines lightweight markdown body rhythm for common HTML elements", () => {
    const globals = readProjectFile("src/app/globals.css");

    expect(globals).toContain(".markdown-body :where(p)");
    expect(globals).toContain(".markdown-body :where(blockquote)");
    expect(globals).toContain(".markdown-body :where(table)");
    expect(globals).toContain(".markdown-body :where(th)");
    expect(globals).toContain(".markdown-body :where(td)");
    expect(globals).toContain(".markdown-body :where(:not(pre) > code)");
    expect(globals).toContain(".markdown-body :where(.katex-display)");
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
