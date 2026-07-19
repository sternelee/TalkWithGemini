# Changelog

All notable changes to Neo Chat should be documented here.

This project does not yet follow a formal release cadence. Maintainers should
group changes under a level-2 heading that matches the release tag, such as
`## v2.0.0`; the release workflow uses that section as the GitHub release notes
when the matching tag is pushed.

## v2.3.0

- **Local search and navigation:** Added a local global search center, available
  from the sidebar or `Ctrl`/`Cmd` + `K`, across active conversation branches,
  attachments, workspaces, knowledge content, and memories. Search supports
  source, workspace, role, date, and sort controls, cancellable incremental
  indexing, partial-index notices, highlighted results, and direct navigation
  without persisting or uploading its index.
- **Portable backup and restore:** Replaced metadata-only app export with the
  version 3 ZIP format, bundling `manifest.json`, `data.json`, and referenced
  app-owned OPFS files. Added path, size, digest, and extraction validation;
  bounded and cancellable inspection; missing-file reporting; legacy version 2
  JSON import; staged replacement; hydration validation; rollback journaling;
  credential exclusion; and a post-restore credential checklist.
- **Knowledge-base lifecycle:** Separated preserved source files from editable
  or indexable extracted content, with independent storage and index states.
  Added migration, editing, retry, reparse, reindex, cancellation,
  reconciliation, orphan cleanup, and per-file operation serialization while
  retaining originals through parser or vector-service failures.
- **Plugin and MCP safety:** Enforced transport-derived risk floors, added an
  optional destructive-tool confirmation flow with allow-once and deny
  decisions, redacted sensitive arguments, and limited chat-scoped approvals to
  non-destructive `write` and `external` risks. Approvals are bound to stable
  function fingerprints; browser and server checks prevent stale-definition
  execution, and confirmed calls fail closed instead of falling back to legacy
  full-manifest payloads.
- **Markets, search, and deployment health:** Distinguished fresh, cached,
  stale, fallback, and failed marketplace loads so errors are not presented as
  empty catalogs. Unified effective search capability across settings, request
  preflight, and deployment health, preserved the search-enabled setting, and
  kept public Firecrawl search available without an API key while treating an
  explicit non-default Base URL as self-hosted configuration.
- **Self-hosted endpoint compatibility:** Allowed user-configured provider,
  search, RAG, plugin, and remote MCP targets to use HTTP or private-network
  addresses in local or hosted mode. Fixed registries and built-in service
  endpoints retain their HTTPS and host allowlists, and the documentation now
  calls out the administrative trust, SSRF, credential, and transport risks.
- **Chat, media, and export fixes:** Corrected OpenAI Responses multi-turn
  assistant-history serialization, added a bounded server image proxy for
  cross-origin image display and export, improved image proxy policy and DNS
  checks, restored model-message download progress, and fixed startup behavior
  that unexpectedly reset search availability.
- **Data integrity:** Coordinated session writes, snapshots, app restore, and
  selective data clearing through shared/exclusive gates so queued writes cannot
  deadlock restore or recreate cleared data. Restore now drains admitted writes
  before replacement, validates hydrated stores and message trees, and rolls
  back interrupted or invalid replacements.
- **Engineering and dependencies:** Added import-alias enforcement, Testing
  Library coverage, isolated Playwright smoke tests on port 3100, and Chromium
  E2E execution in CI. Refreshed provider SDKs and development dependencies,
  excluded E2E artifacts from Vitest and Git, and expanded regression coverage
  for search, backup/restore, knowledge operations, plugins, networking, and UI
  state.

## v2.2.0

- **New capabilities:** Added native Anthropic Messages API support through the
  official SDK, including provider-specific streaming and tool-call handling.
- **MCP integration:** Added remote `streamable-http` MCP server discovery from
  the official MCP Registry, custom server installation, header authentication,
  tool registration, server-side execution, caching, pagination, and hosted URL
  safety controls. Local stdio, npm, Docker, and OAuth transports remain out of
  scope for this version.
- **Reliability and security:** Strengthened API route access policy, request
  body and response limits, terminal stream validation, context budgeting and
  compression, outbound URL/DNS checks, shared plugin registration, and Worker
  gzip-size and deployment dry-run validation.
- **Architecture and maintainability:** Split the chat shell, composer,
  message editor, Markdown diagram rendering, and chat-service orchestration
  into smaller components, hooks, and domain modules while preserving the
  existing user-facing workflows.
- **Fixes and experience:** Fixed known issues across branch-preserving chat
  history, tool-call completion, provider response handling, image/export
  fallback, memory/RAG/search/voice workflows, settings, loading/error states,
  and accessibility behavior.
- **Engineering and documentation:** Aligned local, CI, Docker, and Worker
  guidance around Node 22 and pnpm 10.30.3, added artifact-hygiene checks, and
  synchronized Anthropic, MCP, privacy, security, and deployment documentation.

## v2.1.0

- Rebuilt System Settings with clearer grouped controls, an About panel,
  deployment health visibility, local data export/reset actions, and refreshed
  localized settings copy.
- Added native image generation and image editing for models with image
  input/output metadata, including ordered mixed text/image output blocks,
  image edit attachments, and OPFS-backed display caching.
- Expanded built-in plugin media tools: Agnes and Gemini now present as image
  processing plugins, OpenAI-compatible Images API and OpenAI Responses image
  processing are separate built-ins, and image plugin results are compacted into
  tool details/history so follow-up model messages decide how to reference them.
- Added plugin-level API Base URL and Model ID controls for supported image
  plugins, image count parameters where the upstream API supports them, Agnes
  image-to-image editing, and Agnes video image-to-video support with custom
  video model IDs while preserving the two-step `create_video` /
  `get_video_result` workflow.
- Added thinking intensity controls and provider-specific reasoning mapping for
  Gemini and OpenAI-compatible model requests.
- Added Japanese localization across the app, SEO metadata, LobeHub assistant
  locale routing, voice language handling, and the public Skills catalog.
- Hardened hosted deployments with API request proof, stronger shared-store and
  rate-limit checks, service health coverage, safer URL/secret handling, and
  expanded test coverage.
- Fixed Cloudflare Workers preview/deploy commands and kept Worker deploys from
  dropping dashboard-managed variables.
- Refined code block rendering, syntax highlighting, sandboxed HTML preview,
  Mermaid/mind map/SVG rendering behavior, and release automation based on
  matching `CHANGELOG.md` sections.
- Added a fork-only upstream sync workflow and README guidance for keeping fork
  repositories current with `u14app/neo-chat`.

## v2.0.0

- Added open-source governance files, issue templates, pull request template,
  Dependabot configuration, and documentation for environment variables,
  plugin development, and privacy/data handling.
- Added required Prettier format checking to CI after a one-time repository
  formatting pass.
- Added text-only Skills with localized public catalogs, install/uninstall,
  local edits, custom skills, auto-selection, and workspace presets.
- Expanded message rendering with safe inline HTML visual blocks, Mermaid and
  mind map fullscreen rendering, richer source blocks, and visible search
  failure states.
- Hardened hosted and multi-instance deployment behavior with shared plugin
  registry storage, document parse job secrets, deployment health checks,
  trusted proxy guidance, and safer sandbox/document parsing limits.
- Added local memory documentation and Mimo voice defaults alongside existing
  search, RAG, document parsing, and BYOK configuration guidance.
