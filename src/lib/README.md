# Core Library

The `src/lib` directory contains shared infrastructure for API handling, streaming, provider adapters, security, plugin execution, BYOK encryption, chat processing, search/RAG utilities, and general helpers. Code in this directory should be framework-aware only when necessary and should avoid UI concerns.

## Directory Map

```text
src/lib/
├── api/
├── app/
├── byok/
├── chat/
├── data/
├── defaultConfig/
├── knowledge/
├── market/
├── plugin/
├── providers/
├── search/
├── security/
├── settings/
├── streaming/
├── utils/
├── errors.ts
├── index.ts
└── seo.ts
```

## Major Areas

### API Infrastructure

`src/lib/api` contains request validation, response helpers, upload helpers, chat route handlers, auxiliary generation handlers, document parse jobs, and shared schemas.

Use this layer for server route concerns such as:

- Validating request bodies with Zod.
- Returning consistent API errors.
- Reading and limiting request payloads.
- Running model or document-processing route workflows.

### BYOK

`src/lib/byok` implements browser encryption and server decryption for bring-your-own-key settings. Browser-entered secrets are encrypted before they are sent to API routes.

### Chat

`src/lib/chat` contains message normalization, effective context calculation, generation lifecycle helpers, message trees, session export, and send-time processing.

### Plugin

`src/lib/plugin` contains plugin manifest parsing, OpenAPI conversion, execution payload validation, server plugin registration, localization helpers, and function resolution.

### Providers And Streaming

`src/lib/providers` defines provider configuration and metadata helpers. `src/lib/streaming` converts provider-specific streaming responses into the app's internal chunk and tool-call format.

### Security

`src/lib/security` contains URL policy checks, safe fetch wrappers, access control helpers, rate-limit stores, remote attachment validation, local secret resolution, and deployment-mode policy.

### Utilities

`src/lib/utils` contains focused helpers for attachments, history, model capabilities, RAG, speech, generated images, object URL lifecycles, tool display, and related client/server utilities.

## Guidelines

- Keep modules small and domain-specific.
- Prefer explicit data shapes and Zod schemas at API boundaries.
- Keep security checks close to network access.
- Avoid importing React components from `src/lib`.
- Keep browser-only helpers and server-only helpers separated when runtime APIs differ.
- Add tests for helpers that normalize persisted data, provider responses, or security-sensitive inputs.

## Example: API Route Helper

```typescript
import {
  createApiErrorResponse,
  readJsonRequestBody,
} from "@/lib/api/middleware";

export async function POST(request: Request) {
  try {
    const body = await readJsonRequestBody(request);
    return Response.json({ ok: true, body });
  } catch (error) {
    return createApiErrorResponse(error, "Request failed");
  }
}
```

## Example: Provider Utilities

```typescript
import { supportsAttachments, supportsReasoning } from "@/lib/utils/model";

if (supportsAttachments(modelMetadata)) {
  // Attach files in a provider-compatible format.
}

if (supportsReasoning(modelMetadata)) {
  // Enable reasoning display.
}
```

## Verification

Run the project checks after changing shared library behavior:

```bash
pnpm lint
pnpm typecheck
pnpm test
```
