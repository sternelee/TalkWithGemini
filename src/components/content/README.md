# Content Components

Content components render model output and tool output in reusable formats.

## Files

- `Artifact.tsx` renders editable generated artifacts and preview controls.
- `MarkdownRenderer.tsx` renders Markdown, code highlighting, math, media references, and rich inline content.
- `ReasoningBlock.tsx` renders model reasoning summaries or reasoning traces when available.
- `SourceBlock.tsx` renders web-search sources and citation context.
- `ToolCallBlock.tsx` renders tool-call arguments, execution status, and results.

## Guidelines

- Keep formatting helpers in `src/lib/utils`.
- Keep rendering resilient to missing or partially streamed data.
- Treat tool results as untrusted display data and preserve safe formatting.
- Prefer shared primitives for copy, tooltip, and preview interactions.
