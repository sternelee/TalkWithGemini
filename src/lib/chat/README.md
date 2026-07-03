# Chat Library

The `src/lib/chat` directory contains chat-domain helpers that are shared by stores, services, API payload preparation, and UI flows. These modules should understand messages, sessions, branches, and generation lifecycle state, but they should not render UI.

## Files

- `effectiveChatContext.ts` builds the effective provider/search/RAG/plugin context for a request.
- `entities.ts` normalizes chat-domain entities.
- `generationLifecycle.ts` coordinates generation state transitions.
- `messageProcessor.ts` prepares user messages and attachments before sending.
- `messageTree.ts` manages branched message relationships.
- `postGenerationGuards.ts` handles post-generation safety checks.
- `sessionExport.ts` serializes and imports chat session data.

## Message Processing

`messageProcessor.ts` prepares outgoing messages by combining plain text, attachments, RAG context, model capability checks, and placeholder model messages.

```typescript
const processed = await processMessageForSending({
  text: "User message",
  attachments: [],
  selectedModel: "GEMINI:gemini-2.5-flash",
  modelMetadata,
  customModelMetadata,
  ragConfig,
  knowledgeCollections,
});

const { finalText, finalAttachments, ragSources, userMessage } = processed;
```

## Design Guidelines

- Keep message transformations deterministic.
- Preserve persisted-session compatibility when changing entity shapes.
- Keep provider-specific conversion in lower-level utilities where possible.
- Add tests for branch behavior, export/import compatibility, and lifecycle transitions.
- Avoid React imports in this directory.
