# Localization Pull Request Guide

Neo Chat supports localized UI catalogs and selected localized marketplace
metadata. Localization PRs should keep runtime behavior predictable: add the
display language where data exists, fall back to English where it does not, and
prove the key sets stay compatible.

## What To Change

For a new interface locale:

- Add namespace files under `src/i18n/locales/<locale>/` and a matching
  `src/i18n/locales/<locale>.ts` aggregator.
- Add the locale to `SUPPORTED_LOCALES` and `localeLoaders` in
  `src/i18n/request.ts`.
- Add language labels in `System.json` and update the language selector in
  `src/components/settings/SystemSettings.tsx`.
- Update `src/__tests__/messagesParity.test.ts` so the new catalog is checked
  against English.

For assistant market data:

- Update `src/lib/market/agentLocale.ts` so request locales normalize to the
  supported market locale.
- Map list files in `src/app/api/agents/route.ts`, for example
  `ja -> index.ja-JP.json`.
- Map detail files in `src/app/api/agents/[identifier]/route.ts`, for example
  `ja -> <identifier>.ja-JP.json`.
- Add route and client service tests for the list and detail file names.

For Skills marketplace data:

- Add localized metadata only when there is enough translation coverage for the
  marketplace list, for example `public/data/skills/skills.metadata.ja.json`.
- Keep `file` values pointing at English definition files unless the PR also
  ships complete localized definition files. This lets users see localized
  Skills descriptions while detailed Skill content safely falls back to English.
- Add the locale to `SkillDataLocale`, `resolveSkillDataLocale`, and
  `getCatalogPath`.
- Update `src/__tests__/skillsDataset.test.ts` and
  `src/__tests__/skillService.test.ts` to prove localized metadata loads and
  definition files fall back to English when intended.

For SEO and speech:

- Add locale-specific metadata in `src/lib/seo.ts`, including Open Graph locale
  and JSON-LD `inLanguage`.
- Add speech language labels in `Voice.json` and update
  `src/components/settings/VoiceSettings.tsx`.
- Update voice language types, schema validation, browser BCP 47 language tag
  mapping, and provider transcription language hints.

## Quality Bar

- Do not machine-translate blindly without reviewing terminology, UI length,
  placeholders, and product names.
- Preserve placeholders such as `{name}`, rich text markers, and code-like
  strings exactly.
- Keep URLs, provider names, model IDs, environment variables, and file names
  unchanged unless the source string intentionally localizes surrounding prose.
- Do not add placeholder locale files with English copy only. If a surface lacks
  localized data, route it to English explicitly and document that fallback.
- Keep PRs focused. UI locale files, assistant market mappings, Skills metadata,
  SEO, and voice support can be one PR only when they target the same locale.

## Verification

Run focused checks before opening the PR:

```bash
corepack pnpm exec vitest run src/__tests__/messagesParity.test.ts
corepack pnpm exec vitest run src/__tests__/agentListRoute.test.ts src/__tests__/agentService.test.ts
corepack pnpm exec vitest run src/__tests__/skillsDataset.test.ts src/__tests__/skillService.test.ts
corepack pnpm exec vitest run src/__tests__/seo.test.ts src/__tests__/schemas.test.ts
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
```

Also verify the language in the browser when the PR affects visible UI:

- Select the locale in Settings.
- Reload the app and confirm the interface language persists.
- Open Assistants, Skills, Plugins, Settings, and Voice settings if touched.
- Confirm missing localized Skills definitions intentionally show English
  content rather than broken links.
