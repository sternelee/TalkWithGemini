# Neo Chat

<p align="center">
  <img src="public/logo.png" width="96" alt="Neo Chat logo" />
</p>

<p align="center">
  <strong>A local-first AI chat workspace for models, agents, plugins, search, RAG, voice, and artifacts.</strong>
</p>

<p align="center">
  <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="https://github.com/u14app/neo-chat/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/u14app/neo-chat/actions/workflows/ci.yml/badge.svg" /></a>
  <a href="https://github.com/u14app/neo-chat/actions/workflows/docker.yml"><img alt="Docker" src="https://github.com/u14app/neo-chat/actions/workflows/docker.yml/badge.svg" /></a>
  <img alt="Next.js" src="https://img.shields.io/badge/Next.js-16-black" />
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178c6" />
</p>

Neo Chat is a self-hostable, local-first AI chat application built with Next.js, React, TypeScript, and Zustand. It brings multi-provider chat, assistant presets, OpenAPI-style plugin tools, web search, knowledge-base RAG, voice, generated media, Markdown, math, citations, and editable artifacts into one clean workspace.

It is designed for people who want the power of modern AI workspaces without giving up local data ownership. Chat history, workspace metadata, plugin configuration, and files stay in the browser by default; server routes act as controlled proxies for model providers, search, RAG, document parsing, voice, and plugin execution.

## Features

- Multi-provider chat with Gemini, OpenAI, and OpenAI-compatible endpoints.
- Local-first sessions, branches, pinned chats, workspaces, workspace files, and assistant instructions.
- Assistant presets from the LobeHub agent registry plus local custom assistants.
- OpenAPI-based plugin tools with per-plugin authentication and server-side execution.
- Built-in tools for web reading, weather, Unsplash search, Agnes image generation, and Agnes video generation.
- Web search through Gemini native Google Search or external providers such as Tavily, Firecrawl, Exa, Bocha, and SearXNG.
- Knowledge-base RAG with OPFS file storage, LlamaParse document parsing, and optional vector indexing.
- Voice input and output through browser APIs, ElevenLabs, or compatible configured providers.
- Rich message rendering for Markdown, GFM tables, math, code highlighting, citations, reasoning, tool calls, images, audio, and artifacts.
- Local BYOK encryption for user-entered provider, plugin, search, RAG, and voice secrets.
- Docker and Cloudflare Workers deployment paths.

## Screenshots

![Neo Chat Desktop](public/desktop.png)

![Neo Chat Mobile](public/mobile.png)

## Quick Start

### Requirements

- Node.js 22
- pnpm 10.30.3

### Run Locally

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`, then configure at least one model provider in Settings.

For deployment-wide defaults, copy the environment template:

```bash
cp .env.example .env.local
```

Most settings can be managed in the browser. Server environment variables are useful when you want a shared default provider, hosted deployment safety, access password protection, or managed defaults for search, RAG, document parsing, and voice.

## Deployment

### Docker Compose

```bash
docker compose up --build
```

The compose file publishes Neo Chat on `http://localhost:3000` and uses local/self-hosted safety defaults. For production Docker deployments, set stable BYOK values instead of relying on the compose-only ephemeral BYOK default.

### Docker Image

```bash
docker build -t neo-chat:local .
docker run --rm -p 3000:3000 -e BYOK_ALLOW_EPHEMERAL_KEY=true neo-chat:local
```

The Docker workflow builds pull requests and publishes `main` / `v*` tags to GitHub Container Registry:

```text
ghcr.io/amery2010/neo-chat
```

### Cloudflare Workers

```bash
pnpm build:worker
pnpm preview:worker
pnpm deploy:worker
```

Workers should run in hosted mode and use public HTTPS upstreams. Production Workers should set secrets with Wrangler:

```bash
wrangler secret put BYOK_PRIVATE_KEY_PEM
wrangler secret put BYOK_KEY_ID
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
```

See [Deployment Hardening](docs/deployment-hardening.md) for production configuration guidance.

## Configuration

Neo Chat is local-first by default:

- Core settings, provider records, selected models, and provider API keys are stored in browser `localStorage`.
- Chat metadata, messages, app settings, installed plugins, assistants, and knowledge metadata are stored in IndexedDB through `localforage`.
- Uploaded chat, workspace, and knowledge files are stored in browser OPFS.
- User-entered secrets are encrypted in the browser as BYOK envelopes before being sent to API routes.

Important server-side settings:

```bash
# Access gate
ACCESS_PASSWORD="your-access-password"

# Stable BYOK server key for production
BYOK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
BYOK_KEY_ID="prod-2026-07"
BYOK_ALLOW_EPHEMERAL_KEY="false"

# Deployment safety
DEPLOYMENT_MODE="local" # or hosted
ALLOW_LOCAL_NETWORK_PROXY=""

# Shared short-lived state for hosted or multi-instance deployments
RATE_LIMIT_STORE="upstash"
DOCUMENT_PARSE_JOB_STORE="upstash"
PLUGIN_REGISTRY_STORE="upstash"
UPSTASH_REDIS_REST_URL="https://..."
UPSTASH_REDIS_REST_TOKEN="..."
```

Default model provider:

```bash
DEFAULT_PROVIDER_TYPE="Gemini"
DEFAULT_PROVIDER_NAME="Google Gemini"
DEFAULT_PROVIDER_BASE_URL=""
DEFAULT_PROVIDER_API_KEY="provider-key"
DEFAULT_PROVIDER_MODELS="model-a,model-b"
```

`DEFAULT_PROVIDER_MODELS` supports multiple formats:

```bash
# Comma-separated model IDs
DEFAULT_PROVIDER_MODELS="gpt-5.5,gpt-5.4-mini"

# JSON string array
DEFAULT_PROVIDER_MODELS='["gpt-5.5","gpt-5.4-mini"]'

# JSON object array with display names and capability metadata
DEFAULT_PROVIDER_MODELS='[{"id": "gpt-5.5","name": "GPT-5.5","capabilities": {"vision": true,"audio": false,"attachment": true,"reasoning": true,"tool_call": true}},"gpt-5.4-mini"]'
```

Default task models:

```bash
DEFAULT_MODEL_TITLE_GENERATION="model-a"
DEFAULT_MODEL_RELATED_QUESTIONS="model-a"
DEFAULT_MODEL_CONTEXT_COMPRESSION="model-a"
DEFAULT_MODEL_PROMPT_OPTIMIZATION="model-a"
DEFAULT_MODEL_RAG_QUERY="model-a"
```

Search, RAG, document parsing, and voice defaults:

```bash
DEFAULT_SEARCH_PROVIDER="firecrawl"
# Firecrawl search works without an API key; set one for higher rate limits.
DEFAULT_SEARCH_API_KEY=""
DEFAULT_SEARCH_BASE_URL="https://search.example"

DEFAULT_RAG_BASE_URL="https://rag.example"
DEFAULT_RAG_TOKEN="rag-token"
DEFAULT_RAG_TOP_K="10"
DEFAULT_RAG_CHUNK_SIZE="512"
DEFAULT_RAG_NAMESPACE="default"
DEFAULT_LLAMA_PARSE_API_KEY="llama-parse-key"

DEFAULT_VOICE_PROVIDER="elevenlabs"
DEFAULT_ELEVENLABS_API_KEY="elevenlabs-key"
DEFAULT_ELEVENLABS_STT_MODEL="scribe_v2"
DEFAULT_ELEVENLABS_TTS_VOICE_ID="bIHbv24MWmeRgasZH58o"
```

Public site URL:

```bash
NEXT_PUBLIC_SITE_URL="https://your-domain.com"
```

For the full template, see [.env.example](.env.example).

## Architecture

```mermaid
flowchart LR
  Browser["Browser app\nReact + Zustand"] --> LocalStorage["localStorage\nproviders + settings"]
  Browser --> IndexedDB["IndexedDB\nsessions + plugins + knowledge"]
  Browser --> OPFS["OPFS\nuploads + workspace files"]
  Browser --> ApiRoutes["Next.js API routes"]
  ApiRoutes --> Providers["Model providers\nGemini / OpenAI / compatible"]
  ApiRoutes --> Search["Search providers"]
  ApiRoutes --> Rag["RAG + document services"]
  ApiRoutes --> Plugins["Plugin APIs"]
  ApiRoutes --> Voice["Voice providers"]
  Browser -. encrypted BYOK envelopes .-> ApiRoutes
```

The app keeps durable user data in browser storage whenever possible. API routes provide:

- provider request normalization and streaming;
- BYOK decryption on the server side;
- URL safety gates for proxied upstreams;
- plugin execution through registered plugin IDs and function names;
- hosted-mode checks for shared stores and local-network restrictions.

## Plugins, Search, RAG, and Voice

Plugins are installed from manifests or built-in definitions. Enabled plugin functions are exposed to compatible models as tools, then executed by the server-side plugin route. Tool-call orchestration uses a high but bounded loop limit to avoid runaway recursive calls while still allowing multi-step tasks.

Search can run through Gemini native Google Search for Gemini models or external providers for other model families. Knowledge-base RAG stores source files in OPFS, optionally parses documents with LlamaParse, and can index chunks into an external vector service.

Voice workflows support browser speech APIs and configured external providers. ElevenLabs defaults are available through environment variables, and the UI can store user-specific secrets locally.

## Security Model

Neo Chat is self-hosting friendly, not a turnkey public SaaS security boundary.

- `DEPLOYMENT_MODE=local` allows local and private-network proxy targets for private deployments.
- `DEPLOYMENT_MODE=hosted` blocks localhost, private-network, and plain-HTTP proxy targets unless explicitly overridden.
- BYOK envelopes prevent plain user-entered secrets from being sent in request bodies.
- API schemas reject unknown high-risk fields and oversized payloads.
- Plugin execution remains server-proxied and validated, but runtime tool calls no longer require a user confirmation modal.
- `ACCESS_PASSWORD` is a deployment gate, not an account system.

Before exposing Neo Chat as a public multi-user service, add account authentication, tenant isolation, server-side secret storage, quotas, audit logs, abuse controls, and provider spend limits.

See [Reliability and Safety Model](docs/reliability-and-safety.md) for runtime behavior and recovery notes.

## Development

Quality checks:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level low
```

Useful scripts:

```bash
pnpm dev              # Start Next.js dev server
pnpm build            # Production build
pnpm start            # Start production server
pnpm format           # Format the repository with Prettier
pnpm format:check     # Check repository formatting
pnpm build:worker     # Build for Cloudflare Workers
pnpm preview:worker   # Preview Worker build
pnpm deploy:worker    # Deploy Worker build
pnpm byok:generate    # Generate copyable BYOK key values
```

Project layout:

```text
src/app/              Next.js routes and API routes
src/components/       Chat UI, settings, plugin market, knowledge base
src/lib/              Server/client domain helpers and safety gates
src/services/         Provider, search, voice, RAG, and plugin service clients
src/store/            Zustand stores and persistence migrations
src/__tests__/        Vitest coverage for utilities, routes, and workflows
docs/                 Deployment and reliability notes
```

Project documentation:

- [Environment Variables](docs/environment-variables.md)
- [Plugin Development](docs/plugin-development.md)
- [Privacy and Local Data](docs/privacy-and-local-data.md)
- [Deployment Hardening](docs/deployment-hardening.md)
- [Reliability and Safety Model](docs/reliability-and-safety.md)
- [Roadmap](ROADMAP.md)
- [Changelog](CHANGELOG.md)

## FAQ

### Does Neo Chat store my data on a server?

By default, durable chat and configuration data live in browser storage. API routes proxy external services, and production deployments should still treat server logs, upstream services, and configured stores according to their own privacy requirements.

### Can I use OpenAI-compatible providers?

Yes. Add an OpenAI-compatible provider in Settings or configure deployment defaults with `DEFAULT_PROVIDER_TYPE="OpenAI Compatible"` and a compatible `/v1` base URL.

### Why do I need a stable BYOK private key in production?

Browser secrets are encrypted to the server public key. If the server private key changes, existing local envelopes cannot be decrypted until users re-enter their secrets.

### Can I deploy this as a public SaaS?

Not as-is. Hosted mode tightens URL policy and shared-state requirements, but public SaaS still needs accounts, tenancy, quotas, auditing, and server-side secret management.

### Why did a tool stop after many calls?

Neo Chat keeps tool calls high but bounded. The model can run multi-step tool workflows, but recursive tool loops stop after the configured tool-round limit.

### How do I retrieve previous versions?

Previous versions of the project were developed solely based on the Gemini ecosystem. If you need previous versions, you can obtain them from the `gemini-next-chat` branch, **which has its code archived**.

## Contributing

Contributions are welcome. Keep changes focused, preserve local-first behavior, and run the quality checks before opening a pull request. For security-sensitive changes, include tests for both local and hosted deployment modes.

Read [Contributing](CONTRIBUTING.md), [Security Policy](SECURITY.md), and the
[Code of Conduct](CODE_OF_CONDUCT.md) before opening larger changes.

## License

Neo Chat is released under the [MIT License](LICENSE).
