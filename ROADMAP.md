# Roadmap

This roadmap describes likely directions for Neo Chat. It is not a commitment
to ship every item, and priorities may change as contributors find bugs,
deployment issues, or simpler implementation paths.

## Near Term

- Keep local-first chat, workspace, skill, plugin, assistant, memory, and knowledge flows
  stable across browser refreshes and storage migrations.
- Keep public documentation current as deployment, skills, plugin execution,
  privacy, and configuration behavior changes.
- Tighten CI quality gates with formatting, linting, type checking, tests,
  builds, and dependency audits.

## Mid Term

- Continue improving hosted deployment readiness with operational checks,
  shared-store diagnostics, and safer defaults.
- Expand plugin and skills workflow examples for OpenAPI-compatible tools and
  text-only reusable instructions.
- Improve knowledge-base recovery, indexing diagnostics, and user-facing error
  states.
- Add more screenshots and workflow examples for common model, search, RAG,
  voice, skills, plugin, and deployment health setups.

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
- Skills are text-only prompt context. They do not execute scripts, call
  networks, or access local files.
