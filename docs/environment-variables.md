# Environment Variables

Neo Chat is local-first by default. Most user settings can be configured in the
browser, while environment variables provide deployment-level defaults,
security boundaries, and shared infrastructure configuration.

Use `.env.example` as the source template.

## Cloudflare Workers

For local development, use `.env.local` or `.dev.vars` as appropriate. Do not
commit production `.env` files.

For production Cloudflare Workers deployments, configure runtime values in the
Cloudflare dashboard under **Settings -> Variables and Secrets**. Configure
build-time values separately under **Settings -> Builds -> Variables and
Secrets** when Workers Builds must read them during `next build`. Build
variables are not available at runtime.

Use this Workers Builds setup:

```bash
Build command: pnpm build:worker
Deploy command: pnpm exec opennextjs-cloudflare deploy -- --keep-vars
```

`--keep-vars` preserves dashboard-managed runtime variables and secrets across
deployments. Without it, deployments can replace dashboard variables with only
the values present in `wrangler.jsonc`.

Only non-sensitive deployment defaults should live in `wrangler.jsonc`. Each
deployment should set its own secrets in Cloudflare. Provider keys configured as
`DEFAULT_*_API_KEY` values are deployment-wide defaults shared by all users of
that Worker instance; leave them empty when users should bring their own keys in
the browser.

## Access Control

| Variable          | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `ACCESS_PASSWORD` | Optional deployment-level password gate. This is not an account or tenant system. |

## BYOK Server Key

| Variable                   | Purpose                                                                                                                                   |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `BYOK_PRIVATE_KEY_PEM`     | Stable private key used by server routes to decrypt BYOK envelopes. Required for production unless ephemeral keys are explicitly allowed. |
| `BYOK_KEY_ID`              | Identifier for the active BYOK key. Use a stable value that changes when the key changes.                                                 |
| `BYOK_ALLOW_EPHEMERAL_KEY` | Allows temporary BYOK keys for local smoke tests. Keep `false` for production.                                                            |

Generate copyable BYOK values with:

```bash
pnpm byok:generate
```

## Deployment Safety

| Variable                    | Purpose                                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `DEPLOYMENT_MODE`           | `local` allows local/private proxy targets; `hosted` blocks them by default and expects shared stores.   |
| `ALLOW_LOCAL_NETWORK_PROXY` | Explicit override for local/private-network proxy access. Keep disabled for hosted internet deployments. |
| `TRUST_PROXY_HEADERS`       | Trust forwarded proxy headers only when the hosting platform strips spoofed values.                      |

`TRUST_PROXY_HEADERS` affects request identity used by deployment diagnostics
and rate limiting. Leave it `false` unless Neo Chat is behind a trusted proxy
that removes client-supplied forwarded headers.

## Shared Stores

| Variable                   | Purpose                                                                                               |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `RATE_LIMIT_STORE`         | Store for rate-limit state. Use `upstash` for hosted or multi-instance deployments.                   |
| `DOCUMENT_PARSE_JOB_STORE` | Store for document parsing jobs. Use `upstash` for hosted or multi-instance deployments.              |
| `PLUGIN_REGISTRY_STORE`    | Store for server-registered plugin manifests. Use `upstash` for hosted or multi-instance deployments. |
| `UPSTASH_REDIS_REST_URL`   | Upstash Redis REST endpoint used by shared stores.                                                    |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token used by shared stores.                                                       |

All three stores may use in-memory state for one local process. Hosted,
Cloudflare Workers, and multi-instance Docker deployments should use `upstash`
for all three so rate limits, document parse jobs, and plugin execution
registry lookups survive across instances.

## Upload Limits

| Variable                    | Purpose                                                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `MAX_ATTACHMENT_FILE_BYTES` | Maximum chat attachment file size in bytes. Defaults to `10485760` and is clamped internally. |

## Public URLs

| Variable               | Purpose                                                                         |
| ---------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL` | Public site URL used by app metadata and generated public links.                |
| `NEXT_PUBLIC_API_URL`  | Optional public API base URL override. Leave empty for same-origin deployments. |

## Default Model Provider

| Variable                    | Purpose                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_PROVIDER_TYPE`     | Default provider type, such as `Gemini`, `OpenAI`, or `OpenAI Compatible`.                                                                  |
| `DEFAULT_PROVIDER_NAME`     | Display name for the default provider.                                                                                                      |
| `DEFAULT_PROVIDER_BASE_URL` | Base URL for OpenAI-compatible providers.                                                                                                   |
| `DEFAULT_PROVIDER_API_KEY`  | Deployment-level API key for the default provider.                                                                                          |
| `DEFAULT_PROVIDER_MODELS`   | Model IDs exposed by the default provider. Supports comma-separated IDs, JSON string arrays, and JSON object arrays with optional metadata. |

`DEFAULT_PROVIDER_MODELS` JSON object entries may include display metadata,
capability aliases, and explicit modalities:

```bash
DEFAULT_PROVIDER_MODELS='[
  {
    "id": "gpt-image-2",
    "name": "GPT Image 2",
    "capabilities": ["image_generation"]
  },
  {
    "id": "gemini-3.1-flash-image",
    "modalities": {
      "input": ["text", "image"],
      "output": ["text", "image"]
    }
  }
]'
```

Supported capability aliases include `vision`, `attachment`, `audio`,
`reasoning`, `tool_call`, `image_generation`, `image_output`, and
`image_editing`. `image_generation` / `image_output` add `image` to
`modalities.output`; `image_editing` adds `image` to both input and output.
When explicit `modalities.input` or `modalities.output` are present, they are
treated as authoritative for that direction.

Image generation request counts are not configured here. `imageCount` is an
optional per-request API field planned by the app when the selected model
supports image output; it is omitted when the user did not clearly ask for
multiple separate images.

## Default Task Models

| Variable                            | Purpose                                                   |
| ----------------------------------- | --------------------------------------------------------- |
| `DEFAULT_MODEL_TITLE_GENERATION`    | Model used for automatic chat title generation.           |
| `DEFAULT_MODEL_RELATED_QUESTIONS`   | Model used for related-question generation.               |
| `DEFAULT_MODEL_CONTEXT_COMPRESSION` | Model used for history/context compression.               |
| `DEFAULT_MODEL_PROMPT_OPTIMIZATION` | Model used for prompt optimization.                       |
| `DEFAULT_MODEL_RAG_QUERY`           | Model used for RAG query generation.                      |
| `DEFAULT_MODEL_MEMORY`              | Model used for memory extraction and dream consolidation. |

## Search Defaults

| Variable                  | Purpose                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------- |
| `DEFAULT_SEARCH_PROVIDER` | Default external search provider: `tavily`, `firecrawl`, `exa`, `bocha`, or `searxng`. |
| `DEFAULT_SEARCH_API_KEY`  | Deployment-level search API key when required by the selected provider.                |
| `DEFAULT_SEARCH_BASE_URL` | Base URL for configurable search providers such as SearXNG.                            |

## RAG And Document Processing

| Variable                          | Purpose                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `DEFAULT_RAG_BASE_URL`            | Default vector/RAG service base URL.                                                                   |
| `DEFAULT_RAG_TOKEN`               | Default vector/RAG service token.                                                                      |
| `DEFAULT_RAG_TOP_K`               | Default retrieval count for RAG queries.                                                               |
| `DEFAULT_RAG_CHUNK_SIZE`          | Default chunk size for knowledge indexing.                                                             |
| `DEFAULT_RAG_NAMESPACE`           | Default namespace for vector records.                                                                  |
| `DEFAULT_DOCUMENT_PARSE_PROVIDER` | Default document parser: `mineru` or `llamaParse`.                                                     |
| `DEFAULT_MINERU_API_TOKEN`        | Optional deployment-level Mineru token for precise parsing. Empty uses Mineru's no-token Agent parser. |
| `DEFAULT_LLAMA_PARSE_API_KEY`     | Deployment-level LlamaParse API key for document parsing.                                              |

## Voice Defaults

| Variable                          | Purpose                                                                 |
| --------------------------------- | ----------------------------------------------------------------------- |
| `DEFAULT_VOICE_PROVIDER`          | Default external voice provider. Empty means no default voice provider. |
| `DEFAULT_ELEVENLABS_API_KEY`      | Deployment-level ElevenLabs API key.                                    |
| `DEFAULT_ELEVENLABS_STT_MODEL`    | Default ElevenLabs speech-to-text model.                                |
| `DEFAULT_ELEVENLABS_TTS_MODEL`    | Default ElevenLabs text-to-speech model.                                |
| `DEFAULT_ELEVENLABS_TTS_VOICE_ID` | Default ElevenLabs text-to-speech voice ID.                             |
| `DEFAULT_MIMO_API_KEY`            | Deployment-level Mimo API key.                                          |
| `DEFAULT_MIMO_STT_MODEL`          | Default Mimo speech-to-text model.                                      |
| `DEFAULT_MIMO_TTS_MODEL`          | Default Mimo text-to-speech model.                                      |
| `DEFAULT_MIMO_TTS_VOICE_ID`       | Default Mimo text-to-speech voice ID.                                   |

When `DEFAULT_VOICE_PROVIDER` is set to `elevenlabs` or `mimo`, an empty default model disables that single STT or TTS capability. The browser UI falls back to native browser speech for disabled default capabilities.

`DEFAULT_MIMO_*` values configure the Mimo server default only when
`DEFAULT_VOICE_PROVIDER=mimo` and `DEFAULT_MIMO_API_KEY` is present. Otherwise
they remain available as documented defaults without exposing a shared provider.

## Default System Behavior

| Variable                            | Purpose                                                                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `DEFAULT_SYSTEM_PROMPT`             | Default system prompt used when the browser has no local override.                                                                        |
| `DEFAULT_ENABLE_AUTO_TITLE`         | Enables automatic title generation by default.                                                                                            |
| `DEFAULT_ENABLE_RELATED_QUESTIONS`  | Enables related-question suggestions by default.                                                                                          |
| `DEFAULT_ENABLE_AUTO_COMPRESSION`   | Enables automatic context compression by default.                                                                                         |
| `DEFAULT_COMPRESSION_THRESHOLD`     | Number of turns before automatic compression can run.                                                                                     |
| `DEFAULT_HISTORY_KEEP_COUNT`        | Number of recent history items retained after compression.                                                                                |
| `DEFAULT_ENABLE_CODE_COLLAPSE`      | Enables collapsible code blocks by default.                                                                                               |
| `DEFAULT_ENABLE_HTML_VISUAL_PROMPT` | Guides models to use safe inline HTML for visual structures. Defaults to enabled; set to `false` to disable for new self-hosted defaults. |

`DEFAULT_ENABLE_HTML_VISUAL_PROMPT` changes model instructions only. Message
rendering still sanitizes inline HTML and blocks scripts, event handlers,
iframes, unsafe URLs, and full HTML documents.
