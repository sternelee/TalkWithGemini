# Reliability and Safety Model

Neo Chat remains local-first and self-hosting friendly. Runtime safeguards focus
on keeping user data recoverable, routing external side effects through
controlled server boundaries, and staying within model context limits.

## Generation Errors

Chat generation uses explicit states: `idle`, `pending`, `attachments`, `rag`,
`searching`, `tool`, `model`, `done`, `error`, and `aborted`.

Provider and orchestration failures are stored on `Message.generationError`
instead of being written into assistant content as `Error: ...`. The UI renders
these errors as recoverable status blocks so retry, regenerate, branch, and
stop flows do not confuse model output with application errors.

## Plugin Tool Safety

Plugin functions carry risk metadata:

- `read`: reads remote or local context.
- `write`: may create or update external data.
- `destructive`: may delete or overwrite external data.
- `external`: may trigger an external service or workflow.

If risk is not provided by the plugin manifest, Neo Chat infers it from the HTTP
method: `GET` is `read`, `DELETE` is `destructive`, and other non-GET methods are
`write`.

Runtime tool calls execute automatically once a plugin is enabled for the chat.
There is no per-call confirmation modal. Plugin execution still goes through the
server route, request schema validation, BYOK secret handling, outbound URL
policy, response limits, and the configured tool-call round ceiling. Hosted
deployments still require server-registered plugins; client-submitted legacy
plugin definitions remain blocked.

## Knowledge Base Recovery

Knowledge files keep their metadata until backing resources are cleaned up
successfully. Strict delete and cancel paths fail before removing metadata if
OPFS or vector cleanup fails.

Store recovery actions:

- `cancelUpload(collectionId, fileId)` removes an in-flight file only after local
  and vector resources are cleaned.
- `retryFile(collectionId, fileId)` retries index rebuild when a local OPFS copy
  exists, or tells the user to upload again when the original file is unavailable.
- `reconcileCollection(collectionId)` lists `knowledge-base/<collectionId>`,
  deletes orphan OPFS files, and marks metadata entries with missing local
  content as recoverable errors.

RAG update and reindex paths remove stale vector ids when a newer version has
fewer chunks, which prevents old chunks from continuing to appear in retrieval.

## Context Budgeting

Context planning is centralized in `src/lib/chat/contextBudget.ts`.

The planner uses model metadata when available:

- `limit.context` sets the input token ceiling.
- `limit.output` is reserved for the model response.
- A stable character estimate is used when token metadata is unavailable.

Current allocation bands are history, attachments, search, RAG, and tools.
Search context injection already uses this planner before adding web results to
the model input. Other context producers should use the same helper instead of
adding independent truncation rules.

## UI Accessibility Baseline

Shared primitives provide consistent focus and announcement behavior:

- `Dialog` traps focus, restores focus, and closes with Escape.
- `Menu` supports ArrowUp, ArrowDown, Home, End, and Escape focus return.
- `Toast` uses `role="status"` or `role="alert"` with `aria-live`.
- `SafeImage` defaults to lazy loading, async decoding, and `no-referrer`.

New menus, dialogs, form fields, and image displays should prefer these
primitives before adding local one-off behavior.
