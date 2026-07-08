# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js/React chat application using TypeScript, Zustand, Vitest, and
pnpm. Core routes and API handlers live in `src/app/`. UI components are grouped
under `src/components/`, with feature-specific chat hooks in
`src/features/chat/`. Shared domain logic, provider adapters, security gates,
and API helpers live in `src/lib/`; client service wrappers are in
`src/services/`; persisted Zustand stores and migrations are in `src/store/`.
Tests are centralized in `src/__tests__/`. Static images and skill metadata live
under `public/`, and operational docs live in `docs/`.

## Build, Test, and Development Commands

Use the pinned package manager (`pnpm@10.30.3`), preferably through Corepack:

- `corepack pnpm install` installs dependencies from `pnpm-lock.yaml`.
- `corepack pnpm dev` starts the local Next.js server at `localhost:3000`.
- `corepack pnpm build` creates the production Next.js build.
- `corepack pnpm lint` runs ESLint with Next.js core-web-vitals and TypeScript
  rules.
- `corepack pnpm typecheck` runs `tsc --noEmit`.
- `corepack pnpm test` runs the Vitest suite.
- `corepack pnpm build:worker` builds the OpenNext Cloudflare Worker output.

## Coding Style & Naming Conventions

Prettier is authoritative: 2-space indentation, 80-column print width,
semicolons, double quotes, and trailing commas. Keep TypeScript strict-friendly
and prefer explicit domain types over broad `any` unless existing integration
code already requires it. Components use `PascalCase`, hooks use `useCamelCase`,
tests use `*.test.ts` or `*.test.tsx`, and path aliases may use `@/` for `src/`.

## Testing Guidelines

Add focused Vitest coverage for bug fixes, migrations, API routes, provider
adapters, security-sensitive behavior, and renderer changes. Run targeted tests
while iterating, for example:

```bash
corepack pnpm exec vitest run src/__tests__/pluginConfig.test.ts
```

Before a pull request, run `format:check`, `lint`, `typecheck`, `test`, and
`build`. Add `build:worker` when Cloudflare, runtime environment, or deployment
code changes.

## Commit & Pull Request Guidelines

History uses conventional-style prefixes such as `feat:`, `fix:`, `refactor:`,
`chore:`, and `doc:`. Keep commits focused and imperative, for example
`fix: preserve Cloudflare dashboard vars`. Pull requests should describe the
user-facing change, list verification commands, link related issues, and include
screenshots for UI changes. Update docs when changing configuration,
deployment, localization, plugins, privacy boundaries, or user workflows.

## Security & Configuration Tips

Use `.env.local` for local secrets and keep `.env.example` plus
`docs/environment-variables.md` current. Do not commit API keys, access
passwords, private chat logs, generated user files, or real provider responses.
For Cloudflare deploys, preserve dashboard variables with the existing
`--keep-vars` deployment flow.
