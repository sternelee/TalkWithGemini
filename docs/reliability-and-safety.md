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

Search failures are also rendered as search blocks instead of disappearing from
the conversation. The block keeps the failed search visible with sanitized
error text, while successful search updates merge sources and images without
duplicating previously streamed entries.

## Skills Runtime

Skills are text-only prompt-context modules, not executable tools. Built-in
skill metadata is loaded from locale-specific catalogs under
`public/data/skills`, and full definitions are fetched only after installation
or selection. Installed skills, local edits to built-in skills, custom skills,
active skill ids, catalog caches, and definition caches are persisted in the
browser.

Only installed active skills can be applied to a message. When auto-selection is
enabled, the model can choose from that active installed set; when disabled, all
active skills are injected directly. Skills must stay text-only and are
normalized to reject script, external-tool, network, or file-system
requirements.

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

Built-in plugin IDs are reserved. Custom or manifest-installed plugins cannot
override them, and built-ins take precedence if a stale mutable registry entry
uses the same ID. If multiple active plugins expose the same function name, tool
resolution reports the collision instead of guessing which plugin should run.

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

RAG search respects the selected scope. Collection attachments query the whole
collection, while indexed file attachments restrict returned sources to the
selected file IDs. Search source metadata is normalized and preserved so source
blocks can show citations, images, collection IDs, and file IDs consistently.

## Document Parse Jobs

Document parsing jobs include an opaque job secret. The client must provide
that secret when polling or cancelling `/api/doc-parse/jobs/:id`; requests
without the secret are rejected. Hosted deployments must use a shared
`DOCUMENT_PARSE_JOB_STORE` so jobs are not lost when another instance handles
the poll.

Mineru ZIP results are bounded before extraction. The parser limits entry
count, decompressed size, compression ratio, and final Markdown size before
using `full.md`, reducing risk from oversized or highly compressed archives.

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

## Rendering And Sandbox Boundaries

Markdown rendering supports safe inline HTML visual blocks, Mermaid diagrams,
mind maps, image previews, citations, and artifacts. Inline HTML is sanitized;
scripts, event handlers, iframes, unsafe URLs, full HTML documents, and unsafe
style constructs are blocked before rendering.

Native model image output is stored as ordered `MessageOutputBlock` entries.
Mixed Gemini text/image responses and OpenAI image-generation events append
`text` and `image` blocks in the order received, so chat rendering, reading
mode, PNG export, and PDF print views use `outputBlocks` instead of only
`message.content`. User-sent and model-generated images can keep OPFS
display-cache copies mapped to the original `data` or remote `url`; renderers
resolve those OPFS files to runtime Blob URLs and revoke the Blob URLs when the
component unmounts or the image source changes. Provider payloads strip the
display cache and send only base64 data or the original remote URL.

Remote image URLs still pass through the existing client and server URL safety
policies. The app does not fetch private-network image edit sources on behalf
of users; image edit requests use uploaded inline attachments or provider-side
file URLs that pass validation. If a provider or route does not support a
requested image option such as multiple images, the provider error is surfaced
as a generation failure instead of silently downgrading to another model.

If OPFS display-cache writes or reads fail, rendering falls back to the
canonical message image data instead of failing the generation.

Mermaid and mind map fullscreen views normalize generated SVG root attributes
for stable sizing and export snapshots. Fullscreen dialogs and reader views trap
focus, close with Escape, restore focus on close, respect safe-area insets, and
avoid forced smooth motion for users who prefer reduced motion.

Browser JavaScript artifact execution runs in a terminable worker inside the
sandbox iframe. The sandbox blocks network primitives, caps output, and times
out long-running code instead of letting it hang the page.

## UI Accessibility Baseline

Shared primitives provide consistent focus and announcement behavior:

- `Dialog` traps focus, restores focus, and closes with Escape.
- `Menu` supports ArrowUp, ArrowDown, Home, End, and Escape focus return.
- `Toast` uses `role="status"` or `role="alert"` with `aria-live`.
- `SafeImage` defaults to lazy loading, async decoding, and `no-referrer`.

New menus, dialogs, form fields, and image displays should prefer these
primitives before adding local one-off behavior.
