# Deployment Hardening

Neo Chat is local-first by default. A production self-hosted deployment should
decide whether it is running as a private local app or as a hosted internet app,
then configure secrets and shared state accordingly.

## Local or Private Self-hosted

Use `DEPLOYMENT_MODE=local` for Docker, LAN, or private deployments that need
local provider, RAG, SearXNG, or proxy endpoints.

Recommended settings:

```bash
DEPLOYMENT_MODE=local
ALLOW_LOCAL_NETWORK_PROXY=
BYOK_ALLOW_EPHEMERAL_KEY=false
BYOK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
BYOK_KEY_ID=prod-2026-07
```

If the deployment has more than one instance, use Upstash for shared request
limits and document parse jobs:

```bash
RATE_LIMIT_STORE=upstash
DOCUMENT_PARSE_JOB_STORE=upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

## Hosted Internet Deployment

Use `DEPLOYMENT_MODE=hosted` when the app is reachable from the public internet.
Hosted mode tightens outbound URL policy and CSP. It also requires shared
short-lived state so rate limits and document parse jobs behave consistently
across instances.

Required hosted settings:

```bash
DEPLOYMENT_MODE=hosted
ALLOW_LOCAL_NETWORK_PROXY=false
RATE_LIMIT_STORE=upstash
DOCUMENT_PARSE_JOB_STORE=upstash
PLUGIN_REGISTRY_STORE=upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
BYOK_ALLOW_EPHEMERAL_KEY=false
BYOK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
BYOK_KEY_ID=prod-2026-07
```

## Cloudflare Workers Environment Variables

OpenNext and Cloudflare Workers have separate build-time and runtime
configuration surfaces.

For Cloudflare Workers Builds, set:

```bash
Build command: pnpm build:worker
Deploy command: pnpm exec opennextjs-cloudflare deploy -- --keep-vars
```

`--keep-vars` prevents deployments from replacing runtime variables configured
in the Cloudflare dashboard with only the values committed in `wrangler.jsonc`.

Set runtime variables in the Worker dashboard under **Settings -> Variables and
Secrets**. Use plain variables only for non-sensitive deployment defaults:

```bash
DEPLOYMENT_MODE=hosted
RATE_LIMIT_STORE=upstash
DOCUMENT_PARSE_JOB_STORE=upstash
PLUGIN_REGISTRY_STORE=upstash
BYOK_ALLOW_EPHEMERAL_KEY=false
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

Use secrets for sensitive values:

```bash
BYOK_PRIVATE_KEY_PEM
BYOK_KEY_ID
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
ACCESS_PASSWORD
DEFAULT_PROVIDER_API_KEY
DEFAULT_SEARCH_API_KEY
DEFAULT_RAG_TOKEN
DEFAULT_LLAMA_PARSE_API_KEY
DEFAULT_ELEVENLABS_API_KEY
DEFAULT_MIMO_API_KEY
```

Workers Builds also has **Settings -> Builds -> Variables and Secrets**. Values
there are available only during the build step. Add `NEXT_PUBLIC_*` values and
any non-public values required by static generation there as well as in runtime
variables when the app also needs them after deployment.

Keep personal API keys and deployment secrets out of source control.
Deployment-level defaults such as `DEFAULT_PROVIDER_API_KEY` are shared by every
user of that Worker instance. Leave them unset when users should provide their
own provider keys in local browser settings.

Hosted mode also disables legacy plugin execution payloads where the browser
submits a complete plugin manifest and function definition to the server. Plugin
calls must resolve through server-registered plugin ids and function names. Once
a plugin is enabled for a chat, runtime tool calls execute automatically without
a per-call confirmation modal. See [Reliability and Safety Model](reliability-and-safety.md)
for tool execution boundaries, context budgeting, and recovery behavior.

## Runtime Recovery

Knowledge-base OPFS files and vector records should be treated as durable user
data. Use the built-in reconciliation flow after storage errors, interrupted
uploads, or manual OPFS changes. It detects missing local files, cleans orphan
files, and leaves recoverable metadata instead of silently dropping entries.

Search, RAG, attachment, and tool context should share the central context
budget helper so hosted and local deployments behave consistently across model
providers with different context limits.

## Access Password Boundary

`ACCESS_PASSWORD` is a deployment gate for a single private deployment. It is
not a user account system. Before offering Neo Chat as a public multi-user SaaS,
add account authentication, tenant isolation, server-side secret storage,
quotas, audit logs, abuse controls, and provider spend limits.

## Dependency Gate

Production changes should pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level low
```
