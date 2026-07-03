# Refactor Architecture Boundaries

This project uses incremental refactors. Each step must keep the public route
URLs, persisted storage keys, message tree shape, BYOK envelopes, and request
schemas compatible unless a separate migration plan says otherwise.

## Directory Roles

- `src/components` contains rendering, local interaction, and feature-local UI
  composition. Components should receive explicit props and avoid hidden store
  writes when a feature hook can own the workflow.
- `src/features/<domain>` contains feature hooks, view models, and feature
  composition. A feature module can subscribe to stores and orchestrate UI
  workflows.
- `src/lib/<domain>` contains domain logic and helpers that are independent of
  React rendering. Server-only modules can live here when they are clearly
  named and not imported by client components.
- `src/services/api` is the browser-facing API client layer. It should call API
  routes and return typed results, not hide store mutations.
- `src/app/api/**/route.ts` should parse requests, call server feature modules,
  and return responses. Provider-specific branches belong in adapters.

## Naming

- React component files use `PascalCase.tsx`.
- Hooks use `useX.ts`.
- Non-component helpers, server modules, and domain utilities use
  `camelCase.ts`.
- Next route convention files keep their framework names.
- Rename files only when they are already being moved or split.

## Type Ownership

- Domain-local type files live next to their domain, such as
  `src/lib/chat/types.ts` and `src/lib/plugin/types.ts`.
- `src/types.ts` remains the compatibility export for existing imports.
- New code should prefer domain-local type imports when the owning domain is
  obvious.

## Client And Server Boundaries

- Client components and hooks must not import server-only modules.
- API routes should pass external dependencies, such as fetch and secret
  decryption, into extracted executors when that keeps tests explicit.
- Server adapters should normalize provider behavior but leave route schemas and
  response contracts intact.

## Verification

Every independently mergeable phase should pass:

```bash
pnpm typecheck
pnpm lint
pnpm test
```
