# Content Components

Content components render model output and tool output in reusable formats.

## Files

- `Artifact.tsx` renders editable generated artifacts and preview controls.
- `MarkdownRenderer.tsx` renders Markdown, safe inline HTML visual blocks, code highlighting, math, media references, Mermaid diagrams, mind maps, and rich inline content.
- `ReasoningBlock.tsx` renders model reasoning summaries or reasoning traces when available.
- `SourceBlock.tsx` renders web-search sources, image results, citation context, and visible search failure states.
- `ToolCallBlock.tsx` renders tool-call arguments, execution status, and results.

## Guidelines

- Keep formatting helpers in `src/lib/utils`.
- Keep rendering resilient to missing or partially streamed data.
- Treat tool results as untrusted display data and preserve safe formatting.
- Treat inline HTML, generated SVG, tool output, and artifact preview data as untrusted display data.
- Prefer shared primitives for copy, tooltip, and preview interactions.
