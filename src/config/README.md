# Configuration Modules

The `src/config` directory contains static configuration, limits, built-in assistants, and built-in plugin definitions. Keep this layer deterministic: configuration files should export constants, schemas, and small lookup helpers, not runtime side effects.

## Files

```text
src/config/
├── api.ts
├── assistants.ts
├── defaults.ts
├── index.ts
├── limits.ts
├── plugins.ts
└── README.md
```

## Responsibilities

### `api.ts`

Defines API route paths, external service URLs, timeout values, retry settings, cache durations, and retryable status helpers. Use these exports instead of hard-coded route strings.

```typescript
import { API_ROUTES, API_TIMEOUTS } from "@/config/api";

fetch(API_ROUTES.chat.stream, { method: "POST" });
const timeoutMs = API_TIMEOUTS.default;
```

### `assistants.ts`

Defines built-in assistant metadata and assistant categories. Assistant records are product-facing presets and should remain stable enough for persisted references.

```typescript
import { BUILT_IN_ASSISTANTS, ASSISTANT_CATEGORIES } from "@/config/assistants";
```

### `plugins.ts`

Defines built-in plugin manifests, tool schemas, plugin categories, and lookup helpers. Function descriptions and JSON schemas are sent to models as tool declarations, so keep them concise and in English.

```typescript
import {
  BUILT_IN_PLUGINS,
  AGNES_VIDEO_PLUGIN,
  getPluginById,
  getPluginsByCategory,
} from "@/config/plugins";
```

Built-in media plugins use reserved IDs and should stay protocol-specific:

- `agnes-image-generation` is Agnes image processing and supports text-to-image
  and image-to-image inputs.
- `gemini-image-generation` is Gemini image processing.
- `openai-image-generation` is the OpenAI-compatible Images API plugin.
- `openai-responses-image-processing` is the OpenAI Responses API image
  processing plugin.

Agnes video generation is intentionally split into two tools:

- `create_video` creates an asynchronous text-to-video or public HTTPS
  image-to-video task and returns task identifiers.
- `get_video_result` checks the current status or final result by `video_id`,
  with `task_id` kept for legacy lookups. Custom video model lookups can use
  `model_name`.

### `defaults.ts`

Defines default model selections, chat behavior, UI options, search/RAG defaults, voice defaults, memory defaults, HTML visual prompt defaults, and system settings. These values are used when neither local settings nor server defaults provide an override.

```typescript
import {
  DEFAULT_CHAT_CONFIG,
  DEFAULT_SYSTEM_SETTINGS,
} from "@/config/defaults";
```

### `limits.ts`

Centralizes input and payload limits for chat, attachments, plugins, skills, document parsing, settings, and API validation. Prefer adding new limits here when the same boundary is enforced in more than one place.

### `index.ts`

Provides the public barrel for configuration modules. Named imports from the specific module are usually clearer, but the barrel is available when a caller needs several configuration groups.

## Guidelines

- Prefer named exports over default exports.
- Keep configuration values serializable when possible.
- Keep tool descriptions and parameter descriptions in English for stable model tool-calling behavior.
- Put runtime validation in `src/lib/api/schemas.ts` or feature-specific helpers, not in config files.
- Use helper functions such as `getPluginById` when the lookup logic already exists.
- Preserve backward compatibility for exported names that are used by persisted settings or older imports.

## Adding A Built-In Plugin

1. Define the parameter schema near the other plugin schemas.
2. Export a `Plugin` object with stable `id`, `title`, `description`, `baseUrl`, `functions`, and `auth`.
3. Add the plugin to `BUILT_IN_PLUGINS`.
4. Add localized title and description keys in `src/lib/plugin/localizedMeta.ts` and locale files when the plugin is shown in the UI.
5. Add route or utility tests for any provider-specific request shaping or response normalization.

## Adding A Route Constant

Add new routes to `API_ROUTES` in `api.ts`:

```typescript
export const API_ROUTES = {
  myFeature: {
    list: "/api/my-feature",
    detail: (id: string) => `/api/my-feature/${id}`,
  },
} as const;
```

Use the exported constant from callers instead of repeating route strings.
