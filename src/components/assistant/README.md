# Assistant Components

Assistant components power assistant discovery, selection, local customization, and assistant-specific chat controls.

## Files

- `AssistantHub.tsx` renders the assistant hub, including marketplace-style browsing and local assistant management.
- `AssistantHeader.tsx` displays and edits the current assistant's system prompt and assistant context.
- `AssistantList.tsx` renders recommended assistant cards for quick selection.

## Guidelines

- Keep assistant metadata handling compatible with `src/config/assistants.ts` and marketplace records.
- Keep long-running or API-backed assistant work in services.
- Use localized copy for UI strings and keep provider/tool identifiers stable.
