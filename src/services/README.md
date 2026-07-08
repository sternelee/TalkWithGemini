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
│   ├── skillService.ts
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
- Plans optional image generation counts for image-capable models without persisting that value as a chat setting.
- Prepares history for model APIs.
- Adds applied skill context and local memory context when enabled by the chat workflow.
- Runs background context compression.
- Updates tool-call status while streaming and while executing tools.

Image-capable chat models follow the same streaming path as text models when
they can return text and images together. The client appends incoming image SSE
events to ordered `outputBlocks`. OpenAI `gpt-image-*` models use the
`/api/chat/generate-image` direct Images API path; OpenAI text+image models use
the Responses `image_generation` tool; Gemini image models use
`generateContent` / `generateContentStream` with text and image response
modalities. `imageCount` is filled only by `resolveImageGenerationOptions`
when the user clearly asks for multiple separate images, and provider paths
ignore or report unsupported count semantics rather than saving it to settings.
Plugin tool results that expose `images[]`, `imageUrl`, or `imageBase64` remain
in compact tool details/history instead of being appended as automatic image
output blocks.
Before chat or image requests leave the browser, client services strip
display-only OPFS cache metadata from attachments. Image outputs returned by
provider routes are cached into OPFS for display, then rendered as runtime Blob
URLs; the original base64 data or remote URL remains the canonical model and
export payload.

### `agentService.ts`

Fetches assistant marketplace data and assistant details from app API routes.

### `searchService.ts`

Creates search-provider requests for supported external providers. Search safety and provider-specific validation are enforced by API routes and security helpers.

### `ragService.ts`

Calls the configured RAG service for vector queries and upserts.

### `voiceService.ts`

Calls speech-to-text and text-to-speech routes. Browser-native, ElevenLabs, and Mimo-backed flows are selected from user settings or server defaults.

### `pluginService.ts`

Fetches plugin marketplace data and installs plugin manifests.

### `skillService.ts`

Loads localized text-only skill catalogs, fetches full skill definitions on demand, merges built-in and custom skills, and resolves active skills for a message.

### `docParseService.ts`

Starts document parsing jobs and polls document job status through app API routes. Async job polling includes the job secret returned by the start route.

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
