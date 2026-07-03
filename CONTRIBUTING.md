# Contributing

Thanks for helping improve Neo Chat. The project is local-first and
self-hosting friendly, so changes should preserve user data ownership, browser
storage behavior, and hosted deployment safety.

## Development Setup

Requirements:

- Node.js 22
- pnpm 10.30.3

Install dependencies and start the app:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000` and configure at least one model provider in
Settings.

## Quality Checks

Run the checks before opening a pull request:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm audit --audit-level low
```

Use `pnpm format` to apply Prettier formatting across the repository.

## Pull Request Guidelines

- Keep changes focused and explain the user-facing behavior being changed.
- Add tests for bug fixes, data migrations, API routes, and
  security-sensitive behavior.
- Update docs when changing configuration, deployment behavior, plugins,
  privacy boundaries, or user workflows.
- Do not include real API keys, access passwords, provider secrets, private
  chat logs, or user files in issues, tests, screenshots, or fixtures.
- For hosted deployment changes, consider `DEPLOYMENT_MODE=hosted`,
  local-network proxy restrictions, shared stores, rate limits, and server-side
  plugin registry requirements.

## Reporting Security Issues

Do not open public issues for vulnerabilities. Use GitHub Security Advisories:

https://github.com/u14app/neo-chat/security/advisories/new
