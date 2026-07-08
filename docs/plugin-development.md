# Plugin Development

Neo Chat plugins expose OpenAPI-style tools to compatible model providers.
Enabled plugin functions are sent to the model as tools, and runtime tool calls
execute through server routes. Plugins are different from Skills: Skills are
text-only prompt-context instructions stored locally, while plugins are
network-capable tools executed by the server-side plugin route.

## Plugin Shape

Plugins use the `Plugin` and `PluginFunction` interfaces from
`src/lib/plugin/types.ts`.

Required plugin fields:

| Field         | Purpose                                                                 |
| ------------- | ----------------------------------------------------------------------- |
| `id`          | Stable plugin id used by settings, registry lookup, and tool execution. |
| `title`       | User-facing plugin name.                                                |
| `description` | User-facing summary.                                                    |
| `logoUrl`     | Logo URL shown in the plugin market.                                    |
| `manifestUrl` | URL for the source manifest or OpenAPI document.                        |
| `functions`   | Tool functions exposed by the plugin.                                   |

Optional fields include `externalDocsUrl`, `baseUrl`, `category`,
`categories`, `added`, `builtIn`, and `auth`.

Plugin IDs must be stable. Built-in plugin IDs are reserved; a custom plugin or
manifest import cannot replace a built-in tool definition.

## Function Shape

Each function should define:

| Field         | Purpose                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `name`        | Tool name. Keep it stable and model-friendly.                                  |
| `description` | Short description sent to the model.                                           |
| `parameters`  | JSON-schema-like parameter object.                                             |
| `path`        | Relative request path. Absolute URLs and protocol-relative paths are rejected. |
| `method`      | HTTP method, usually `GET`, `POST`, `PUT`, `PATCH`, or `DELETE`.               |
| `risk`        | Optional risk level: `read`, `write`, `destructive`, or `external`.            |

If risk is omitted, Neo Chat infers it from the HTTP method: `GET` maps to
`read`, `DELETE` maps to `destructive`, and other non-GET methods map to
`write`.

## Authentication

Plugin auth supports:

- `none`
- `bearer`
- `apiKey`
- `basic`
- `oauth2`

For API keys, set `name` and `in` (`header` or `query`) when the upstream API
requires a specific key location. User-entered plugin secrets are stored as
local BYOK envelopes before server routes use them.

## OpenAPI Import Constraints

OpenAPI conversion supports a bounded subset:

- The spec must be a JSON object with a `paths` object.
- A server URL or OpenAPI `host` must be present.
- Supported methods are `GET`, `POST`, `PUT`, `PATCH`, and `DELETE`.
- Plugin paths must start with `/`, must not start with `//`, and are truncated
  to the configured path limit.
- Query and path parameters are converted into tool parameters.
- Operation names come from `operationId` when available, with unsafe
  characters converted to underscores.
- The importer caps the number of paths, parameters, and plugin functions to
  prevent oversized manifests.

## Hosted Deployment Registry

Hosted mode blocks legacy payloads where the browser submits a complete plugin
definition for execution. In hosted deployments, plugin execution must resolve
through server-registered plugin ids and function names.

Set shared registry storage for hosted or multi-instance deployments:

```bash
DEPLOYMENT_MODE=hosted
PLUGIN_REGISTRY_STORE=upstash
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
```

Built-in plugins are always resolvable by ID. Custom plugins should be
registered before use and stored in the shared registry for hosted or
multi-instance deployments; otherwise another instance may be unable to resolve
the function call.

Built-in media plugin IDs are reserved and protocol-specific. Agnes and Gemini
image tools are image processing plugins, `openai-image-generation` targets the
OpenAI-compatible Images API, and `openai-responses-image-processing` targets
the OpenAI Responses API. Supported built-ins can expose plugin-level API Base
URL and Model ID fields; Agnes video remains a two-step `create_video` /
`get_video_result` flow and accepts public HTTPS image URLs for image-to-video.

Runtime tool calls execute automatically after a plugin is enabled for the chat.
There is no per-call confirmation modal, so the plugin market, function toggle,
auth configuration, and risk metadata are the user's control points.

If two active plugins expose the same function name, execution returns a
collision error instead of choosing one silently. Keep function names unique
across plugins that users are likely to enable together.

## Safety Checklist

- Keep plugin `baseUrl` and OpenAPI server URLs on trusted HTTPS origins for
  hosted deployments.
- Prefer `GET` for read-only tools and reserve mutating HTTP methods for
  actions that actually change external state.
- Mark destructive or external-side-effect functions with explicit risk
  metadata.
- Keep descriptions concise and specific so the model can choose tools
  correctly.
- Avoid function-name collisions with other built-in or commonly installed
  plugins.
- Do not log plugin secrets, provider keys, or raw private user data.

## Testing

Relevant checks:

```bash
pnpm test -- src/__tests__/pluginConfig.test.ts
pnpm test -- src/__tests__/pluginManifest.test.ts
pnpm test -- src/__tests__/pluginResolve.test.ts
pnpm test -- src/__tests__/serverPluginRegistry.test.ts
```

Run the full project checks before opening a pull request:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```
