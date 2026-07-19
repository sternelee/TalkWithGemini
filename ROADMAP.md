# Roadmap

This roadmap describes likely directions for Neo Chat. It is not a commitment
to ship every item, and priorities may change as contributors find bugs,
deployment issues, or simpler implementation paths.

## Near Term

- Keep local-first chat, workspace, skill, plugin, assistant, memory, and knowledge flows
  stable across browser refreshes and storage migrations.
- Keep public documentation current as deployment, skills, plugin execution,
  privacy, and configuration behavior changes.
- Keep CI quality gates aligned across import hygiene, formatting, linting, type
  checking, unit and E2E tests, builds, and dependency audits.

## Mid Term

- Continue improving hosted deployment readiness with operational checks,
  shared-store diagnostics, and safer defaults.
- Expand plugin and skills workflow examples for OpenAPI-compatible tools and
  text-only reusable instructions.
- Continue hardening knowledge-base recovery and indexing diagnostics across
  browser refreshes, storage migrations, and upstream parser failures.
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
- Plugin calls execute automatically by default. The optional confirmation
  setting gates only calls classified as destructive; read, write, and external
  calls, including MCP tools at the external risk floor, remain automatic, so
  users should enable only plugins they trust.
- Skills are text-only prompt context. They do not execute scripts, call
  networks, or access local files.
