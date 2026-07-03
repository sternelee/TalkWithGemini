# Components

The `src/components` directory contains React UI for the Neo Chat application. Components are grouped by product area and should keep rendering concerns separate from shared library logic, API route logic, and store internals.

## Directory Map

```text
src/components/
├── app/
├── assistant/
├── chat/
├── content/
├── knowledge/
├── layout/
├── media/
├── modals/
├── plugin/
├── settings/
├── ui/
├── index.ts
└── README.md
```

## Areas

### `app`

Top-level app screens and orchestration components, including `ChatApp.tsx` and the access-password screen.

### `assistant`

Assistant discovery, selection, editing, and assistant-specific header controls.

### `chat`

Message input, message rendering, follow-up questions, audio playback, attachments, and message-level actions.

### `content`

Reusable renderers for generated content: Markdown, citations, tool calls, reasoning blocks, source blocks, and editable artifacts.

### `knowledge`

Knowledge-base collection management, RAG source selection, and RAG result display.

### `layout`

Navigation and workspace structure, including the sidebar and workspace settings modal.

### `media`

Preview and interaction components for image and media content.

### `modals`

Reusable feature modals that do not belong to a narrower product area.

### `plugin`

Plugin marketplace, installation, configuration, and built-in plugin management UI.

### `settings`

Settings pages and provider, model, search, RAG, voice, and system configuration controls.

### `ui`

Small reusable primitives such as tooltip, portals, safe image rendering, and shared icons.

## Import Style

Prefer the barrel when it keeps feature code readable:

```typescript
import { MessageInput, MessageItem, Sidebar } from "@/components";
```

Use a direct path when importing a component that is intentionally scoped to one area:

```typescript
import MessageInput from "@/components/chat/MessageInput";
```

## Guidelines

- Keep component props explicit and typed.
- Move reusable domain logic into `src/lib` or `src/services`.
- Keep store reads narrow with selectors or prebuilt hooks.
- Avoid placing large workflow logic directly inside presentational components.
- Use existing UI primitives and icon patterns before adding new ones.
- Add tests around behavior-heavy components or extract the behavior into testable helpers.
