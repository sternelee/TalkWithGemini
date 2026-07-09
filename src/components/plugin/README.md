# Plugin Components

Plugin components manage plugin discovery, MCP server discovery, installation, configuration, authentication, and built-in tool availability.
Plugins are executable server-routed tools. They are separate from Skills, which
are text-only prompt-context instructions.

## Files

- `PluginMarket.tsx` renders the plugin marketplace, installed-plugin management, MCP registry exploration, function toggles, authentication controls, and plugin details.

## Guidelines

- Keep manifest parsing and OpenAPI conversion in `src/lib/plugin`.
- Keep marketplace API calls in `src/services/api/pluginService.ts`. OpenAPI
  marketplace cache and MCP server cache are separate so refreshing one source
  does not overwrite the other.
- Keep MCP as a plugin source in the UI. The market may switch between
  `Plugins` and `MCP`, but installed cards and the message input plugin menu
  should continue using the shared installed/active plugin state.
- Keep built-in media plugin configuration consistent with the execution layer:
  supported plugins may expose API Base URL, Model ID, and image count fields,
  while OpenAI-compatible Images API and OpenAI Responses image processing stay
  separate built-ins.
- Keep tool descriptions and schema text in English because models read them as tool declarations.
- Keep built-in plugin IDs reserved and avoid duplicate active function names.
- Treat plugin authentication as sensitive local-first data and preserve BYOK flows.
