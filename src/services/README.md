# Services

The `src/services` directory contains browser-facing service modules. These modules call Next.js API routes, prepare client-owned data for requests, and coordinate feature workflows that do not belong inside React components.

## Directory Map

```text
src/services/
├── api/
│   ├── agentService.ts
│   ├── chatService.ts
│   ├── docParseService.ts
│   ├── pluginService.ts
│   ├── ragService.ts
│   ├── searchService.ts
│   └── voiceService.ts
├── artifactService.ts
└── README.md
```

## API Client Services

### `chatService.ts`

Handles chat generation workflows from the browser side:

- Streams chat responses.
- Executes model tool calls through plugin utilities.
- Generates titles, related questions, RAG search queries, and image outputs.
- Prepares history for model APIs.
- Runs background context compression.
- Updates tool-call status while streaming and while executing tools.

### `agentService.ts`

Fetches assistant marketplace data and assistant details from app API routes.

### `searchService.ts`

Creates search-provider requests for supported external providers. Search safety and provider-specific validation are enforced by API routes and security helpers.

### `ragService.ts`

Calls the configured RAG service for vector queries and upserts.

### `voiceService.ts`

Calls speech-to-text and text-to-speech routes. Browser-native and ElevenLabs-backed flows are selected from user settings.

### `pluginService.ts`

Fetches plugin marketplace data and installs plugin manifests.

### `docParseService.ts`

Starts document parsing jobs and polls document job status through app API routes.

## Client-Only Services

### `artifactService.ts`

Manages generated artifact creation, editing, continuation, transformation, and preview behavior. This module is client logic and does not directly own server routes.

## Design Boundaries

- Components should call services rather than embedding fetch logic directly.
- Services may read local settings when a workflow requires browser-owned data.
- Sensitive user-entered secrets should travel as encrypted BYOK envelopes.
- Server-only validation and proxy policy should stay in `src/app/api` and `src/lib/security`.
- Store mutations should remain explicit at call sites or in store actions; avoid hidden writes inside low-level service helpers.

## Example

```typescript
import {
  generateChatTitle,
  prepareHistoryForLLM,
  streamChatResponse,
} from "@/services/api/chatService";
import { queryRAG } from "@/services/api/ragService";

await streamChatResponse(
  sessionId,
  model,
  history,
  message,
  attachments,
  config,
  onChunk,
  systemInstruction,
);

const title = await generateChatTitle(history);
const preparedHistory = await prepareHistoryForLLM(
  messages,
  compression,
  model,
);
const ragResults = await queryRAG(query, topK);
```

## Testing Guidance

- Mock `fetch` or service dependencies at the route boundary.
- Test streaming and tool-call behavior with representative chunks.
- Keep provider-specific request shaping covered by route tests.
- Add regression tests when service code coordinates several stores or APIs.
