# Roadmap

This roadmap describes likely directions for Neo Chat. It is not a commitment
to ship every item, and priorities may change as contributors find bugs,
deployment issues, or simpler implementation paths.

## Near Term

- Keep local-first chat, workspace, plugin, assistant, and knowledge flows
  stable across browser refreshes and storage migrations.
- Improve public documentation for deployment, plugin development, privacy,
  and configuration.
- Tighten CI quality gates with formatting, linting, type checking, tests,
  builds, and dependency audits.

## Mid Term

- Improve hosted deployment readiness with clearer shared-store setup,
  operational checks, and safer defaults.
- Expand plugin registry documentation and examples for OpenAPI-compatible
  tools.
- Improve knowledge-base recovery, indexing diagnostics, and user-facing error
  states.
- Add more screenshots and workflow examples for common model, search, RAG,
  voice, and plugin setups.

## Later

- Evaluate account authentication, tenant isolation, server-side secret
  storage, quotas, audit logs, and provider spend controls for public
  multi-user deployments.
- Publish formal releases with release notes, versioned Docker image guidance,
  and upgrade notes.

## Known Limitations

- `ACCESS_PASSWORD` is only a deployment gate, not a user account system.
- Public multi-user SaaS deployments need additional security and operational
  controls before production use.
- Runtime plugin calls execute automatically after a plugin is enabled for a
  chat; users should only enable plugins they trust.
