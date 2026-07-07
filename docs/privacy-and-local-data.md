# Privacy And Local Data

Neo Chat is local-first. Durable user data stays in browser storage whenever
possible, while server routes act as controlled proxies for providers, search,
RAG, document parsing, voice, and plugin execution.

## Browser Storage

Neo Chat uses several browser storage layers:

| Storage                         | Data                                                                                                                                                                        |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `localStorage`                  | Core settings, provider records, selected models, and provider API key envelopes.                                                                                           |
| IndexedDB through `localforage` | Chat metadata, messages, app settings, installed plugins, installed/custom skills, skill catalog and definition caches, assistants, knowledge metadata, and local memories. |
| OPFS                            | Uploaded chat files, workspace files, knowledge-base source files, and image display-cache copies for user-sent or model-generated images.                                  |

Clearing browser data can remove local chats, settings, plugin configuration,
assistant records, memories, and uploaded files.

Generated images from native image models are saved as message output data in
IndexedDB with the rest of the chat message. When users export app data, those
image output blocks are included in the exported conversation payload. PNG/PDF
message exports render the visible output blocks, while full app export
preserves the stored message data.

Image attachments keep their original `data` or remote `url` as the canonical
message data. OPFS image copies are display caches mapped from that original
source and are resolved to runtime `blob:` URLs with `URL.createObjectURL(...)`
for rendering. Blob URLs are not persisted, and model requests strip display
cache metadata before sending base64 data or the original remote URL to a
provider.

Memory is local-first, but it is not invisible to model providers. When the
memory search tool is used, matching memory snippets are included in the
current model request as context. Background memory extraction and dream
consolidation also send the latest exchange or memory set to the configured
memory task model.

Skills are also local-first prompt context. Built-in skill metadata and
definitions are fetched from `public/data/skills`; installed copies, local
edits, custom skills, and active skill selections are stored in browser
storage. When a skill is applied to a message, its instructions are included in
the model request as context. Skills do not execute code, access local files, or
call networks.

## BYOK Envelopes

User-entered secrets are encrypted in the browser before they are sent to API
routes. These include model provider keys, plugin auth values, search keys, RAG
tokens, document parsing keys, and voice provider keys.

Production deployments should configure a stable BYOK private key:

```bash
BYOK_ALLOW_EPHEMERAL_KEY=false
BYOK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
BYOK_KEY_ID=prod-2026-07
```

If the server private key changes, existing local envelopes cannot be decrypted
until users re-enter the affected secrets.

## Server Proxy Boundaries

Server routes can receive prompts, message context, applied skill instructions,
generated tool calls, search queries, document parsing jobs, audio payloads,
plugin requests, and BYOK envelopes. Local memory tool results may also be
present in model request context. Deployments should treat server logs,
observability tools, and hosting provider logs as sensitive.

Neo Chat validates request payloads, applies URL safety gates, limits response
sizes, and uses hosted-mode restrictions, but upstream providers still receive
the content required to complete user-requested actions.

## Third-Party Services

Depending on configuration, user content may be sent to:

- Model providers such as Gemini, OpenAI, or OpenAI-compatible endpoints.
- Search providers such as Tavily, Firecrawl, Exa, Bocha, or SearXNG.
- RAG/vector services and document parsers such as Mineru or LlamaParse.
- Voice providers such as ElevenLabs or Mimo.
- Plugin APIs enabled by the user.

Text-only skills themselves are local prompt instructions, but applied skill
content can be sent to the selected model provider as part of the prompt.

Review each third-party service's privacy, retention, and logging policy before
using it with sensitive data.

## Hosted Deployment Risks

`DEPLOYMENT_MODE=hosted` tightens URL policy and shared-state requirements, but
it does not turn Neo Chat into a full public SaaS security boundary.

Before offering Neo Chat as a public multi-user service, add:

- Account authentication.
- Tenant isolation.
- Server-side secret storage.
- Quotas and provider spend controls.
- Audit logs and abuse controls.
- Operational monitoring and incident response.

## Data Handling Guidelines For Contributors

- Do not commit real secrets, private chats, user uploads, or production logs.
- Redact provider keys, access passwords, BYOK material, and private file names
  from issues and screenshots.
- Keep tests deterministic and use synthetic fixtures.
- Update this document when storage, proxy, BYOK, or third-party data flow
  behavior changes.
