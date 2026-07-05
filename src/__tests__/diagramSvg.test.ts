import { describe, expect, it } from "vitest";
import {
  normalizeMermaidSvg,
  normalizeMindMapSvg,
} from "../lib/utils/diagramSvg";

describe("diagram SVG normalization", () => {
  it("stabilizes Mermaid root attributes for snapshot and export rendering", () => {
    const svg =
      '<svg viewBox="0 0 321.4567 120" width="100%" style="max-width: 100%; color: red"><g/></svg>';

    expect(normalizeMermaidSvg(svg)).toContain(
      'class="markdown-mermaid-svg-snapshot"',
    );
    expect(normalizeMermaidSvg(svg)).toContain('data-diagram-export="mermaid"');
    expect(normalizeMermaidSvg(svg)).toContain('width="321.457"');
    expect(normalizeMermaidSvg(svg)).toContain('height="120"');
    expect(normalizeMermaidSvg(svg)).not.toContain("max-width");
  });

  it("normalizes mind map backgrounds without changing export identity", () => {
    const svg = '<svg><rect width="100%" height="100%" fill="#fff"/><g/></svg>';

    const normalized = normalizeMindMapSvg(svg);
    expect(normalized).toContain('fill="transparent"');
    expect(normalized).toContain('data-diagram-export="mindmap"');
    expect(normalized).toContain('class="markdown-mindmap-svg-snapshot"');
  });

  it("preserves generated SVG internals while normalizing root attributes", () => {
    const svg = `
      <svg viewBox="0 0 100 40">
        <style>.label { font: 12px sans-serif; }</style>
        <foreignObject width="80" height="24">
          <div xmlns="http://www.w3.org/1999/xhtml" class="label">Node</div>
        </foreignObject>
        <defs>
          <marker id="arrow" orient="auto"><path d="M0,0 L10,5 L0,10 z"/></marker>
        </defs>
      </svg>
    `;

    const normalized = normalizeMermaidSvg(svg);

    expect(normalized).toContain("<style>");
    expect(normalized).toContain("<foreignObject");
    expect(normalized).toContain("<marker");
    expect(normalized).toContain('class="markdown-mermaid-svg-snapshot"');
  });
});
