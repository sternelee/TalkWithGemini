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
TRUST_PROXY_HEADERS=false
BYOK_ALLOW_EPHEMERAL_KEY=false
BYOK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
BYOK_KEY_ID=prod-2026-07
```

If the deployment has more than one instance, use Upstash for shared request
limits, document parse jobs, and server-registered plugins:

```bash
RATE_LIMIT_STORE=upstash
DOCUMENT_PARSE_JOB_STORE=upstash
PLUGIN_REGISTRY_STORE=upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

## Hosted Internet Deployment

Use `DEPLOYMENT_MODE=hosted` when the app is reachable from the public internet.
Hosted mode tightens outbound URL policy and CSP. It also requires shared
short-lived state so rate limits, document parse jobs, and server-registered
plugins behave consistently across instances.

Required hosted settings:

```bash
DEPLOYMENT_MODE=hosted
ALLOW_LOCAL_NETWORK_PROXY=false
TRUST_PROXY_HEADERS=false
RATE_LIMIT_STORE=upstash
DOCUMENT_PARSE_JOB_STORE=upstash
PLUGIN_REGISTRY_STORE=upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
BYOK_ALLOW_EPHEMERAL_KEY=false
BYOK_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
BYOK_KEY_ID=prod-2026-07
```

Enable `TRUST_PROXY_HEADERS=true` only when the platform or reverse proxy strips
spoofed forwarded headers before requests reach Neo Chat. These headers affect
rate-limit identity and public request metadata; trusting user-supplied values
can weaken hosted protections.

## Vercel Environment Variables

Vercel runs the standard Next.js build output, not the Cloudflare Workers
OpenNext output. Import the repository with the Next.js framework preset and use
the default output directory.

Recommended project settings:

```bash
Install Command: default, or corepack pnpm install --frozen-lockfile
Build Command: pnpm build
Output Directory: default
```

For public Vercel deployments, use hosted mode and shared stores:

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
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

Set these values in the Vercel project under the Production, Preview, or
Development environments that need them. Vercel environment variables are
available to the build step and to Next.js function execution for that
deployment, so `NEXT_PUBLIC_SITE_URL` should be configured anywhere metadata,
Open Graph image URLs, or generated public links must use the deployed domain.

Keep deployment passwords, provider keys, BYOK key material, Upstash
credentials, and third-party service tokens out of source control. Configure
them as Vercel environment variables instead.

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

## Deployment Health

Settings includes a deployment health panel backed by `/api/health`. The route
returns non-secret status for BYOK, access password, hosted mode, shared stores,
default model, search, RAG/document processing, and voice readiness. Use it
after changing environment variables or moving from single-instance local mode
to hosted or multi-instance deployments.

`/api/health` intentionally reports availability and policy state only. It must
not expose access passwords, BYOK key material, provider keys, Upstash tokens,
or internal Redis URLs.

## Runtime Recovery

Knowledge-base OPFS files and vector records should be treated as durable user
data. Use the built-in reconciliation flow after storage errors, interrupted
uploads, or manual OPFS changes. It detects missing local files, cleans orphan
files, and leaves recoverable metadata instead of silently dropping entries.

Search, RAG, attachment, and tool context should share the central context
budget helper so hosted and local deployments behave consistently across model
providers with different context limits.

Document parsing uses asynchronous jobs for providers such as Mineru and
LlamaParse. In hosted or multi-instance deployments, keep
`DOCUMENT_PARSE_JOB_STORE=upstash`; in-memory job state is only suitable for a
single local process. Polling and cancellation require the job secret returned
when the job is created.

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
