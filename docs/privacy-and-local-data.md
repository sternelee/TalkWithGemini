# Privacy And Local Data

Neo Chat is local-first. Durable user data stays in browser storage whenever
possible, while server routes act as controlled proxies for providers, search,
RAG, document parsing, voice, and plugin execution.

## Browser Storage

Neo Chat uses several browser storage layers:

| Storage                         | Data                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `localStorage`                  | Core settings, provider records, selected models, and provider API key envelopes.             |
| IndexedDB through `localforage` | Chat metadata, messages, app settings, installed plugins, assistants, and knowledge metadata. |
| OPFS                            | Uploaded chat files, workspace files, and knowledge-base source files.                        |

Clearing browser data can remove local chats, settings, plugin configuration,
assistant records, and uploaded files.

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

Server routes can receive prompts, message context, generated tool calls,
search queries, document parsing jobs, audio payloads, plugin requests, and
BYOK envelopes. Deployments should treat server logs, observability tools, and
hosting provider logs as sensitive.

Neo Chat validates request payloads, applies URL safety gates, limits response
sizes, and uses hosted-mode restrictions, but upstream providers still receive
the content required to complete user-requested actions.

## Third-Party Services

Depending on configuration, user content may be sent to:

- Model providers such as Gemini, OpenAI, or OpenAI-compatible endpoints.
- Search providers such as Tavily, Firecrawl, Exa, Bocha, or SearXNG.
- RAG/vector services and LlamaParse.
- Voice providers such as ElevenLabs or Mimo.
- Plugin APIs enabled by the user.

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
