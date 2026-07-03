# Plugin Components

Plugin components manage plugin discovery, installation, configuration, authentication, and built-in tool availability.

## Files

- `PluginMarket.tsx` renders the plugin marketplace, installed-plugin management, function toggles, authentication controls, and plugin details.

## Guidelines

- Keep manifest parsing and OpenAPI conversion in `src/lib/plugin`.
- Keep marketplace API calls in `src/services/api/pluginService.ts`.
- Keep tool descriptions and schema text in English because models read them as tool declarations.
- Treat plugin authentication as sensitive local-first data and preserve BYOK flows.
