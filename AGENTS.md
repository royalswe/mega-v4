# Agent Guide — v4 (Existenz Next Community Engine)

Project-specific guidance for AI coding agents (GitHub Copilot, etc.). For general Payload CMS reference, load the `payload` skill at `.agents/skills/payload/SKILL.md`.

## Stack

- **Framework**: Next.js 16 (App Router) + React 19
- **CMS**: Payload 3.85 with `@payloadcms/db-postgres`
- **Editor**: Lexical 0.35 (pinned via override — do not bump without bumping Payload)
- **Styling**: Tailwind v4 + Radix UI primitives + shadcn-style components in `src/components/ui/`
- **Tests**: Vitest (integration, `tests/vitest/int/`) + Playwright (e2e, `tests/playwright/e2e/`)
- **Package manager**: pnpm (always)
- **TypeScript**: 5.x — TS 6 caused side-effect CSS import errors with `@payloadcms/next/css`; do not upgrade

## Product

This is a community/link-aggregation platform (Reddit / Hacker News / old-school forums vibe) with main feed, subfeeds, user feeds, voting, comments, reports/moderation, reputation. See `FEATURE.md` for the spec and `IMPROVEMENTS.md` for the active roadmap.

## Repo layout

```
src/
  app/(frontend)/        Public-facing routes + server components
  app/(payload)/         Admin panel + Payload-served routes
  app/api/               Custom Next.js route handlers
  app/actions/           Server actions (auth, posts, links, comments, …)
  collections/           Payload collections (one folder per slug)
  access/                Reusable access-control fns (admins, anyone, checkRole, …)
  components/            React components grouped by domain (+ ui/ primitives)
  lib/community/         Domain logic (ranking, feed assembly, etc.)
  migrations/            Payload-generated SQL migrations (commit alongside schema)
  scripts/seed/          Seeder entrypoint (`pnpm run seed`)
  payload.config.ts
  payload-types.ts       Generated — do NOT hand-edit
tests/vitest/int/        Integration tests (Payload Local API)
tests/playwright/e2e/    End-to-end browser tests
```

## Scripts

| Command                             | Purpose                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm dev`                          | Next dev server                                                                                   |
| `pnpm run generate:types`           | Regenerate `src/payload-types.ts` — **run after any collection change** before trusting TS errors |
| `pnpm run generate:importmap`       | Rebuild admin import map — **run after adding/changing custom admin components**                  |
| `pnpm run typecheck`                | `tsc --noEmit`                                                                                    |
| `pnpm run lint`                     | ESLint                                                                                            |
| `pnpm run test`                     | Vitest int + Playwright e2e                                                                       |
| `pnpm run test:int`                 | Vitest only                                                                                       |
| `pnpm run test:e2e`                 | Playwright only                                                                                   |
| `pnpm run migrate -- --name <name>` | Create a new Payload migration                                                                    |
| `pnpm run seed`                     | Run the seeder                                                                                    |

## Project conventions

### Schema & migrations

- After editing any collection/global, run `pnpm run generate:types` **before** trying to interpret TypeScript errors.
- Adding a required field (e.g. `subfeeds.icon`) means updating seeders and integration-test fixtures in the same change, or `tsc --noEmit` will fail.
- Review generated migrations before applying — `payload migrate:create`'s "rename column" choice for type-changed fields (e.g. enum → boolean) can emit invalid SQL; add `ALTER COLUMN ... TYPE ... USING ...` manually.

### Custom admin components

- Always run `pnpm run generate:importmap` after creating or modifying any component referenced from `payload.config.ts` or a collection's `admin.components`.

### Drafts & moderation

- Collections with drafts: status-toggle actions must pass an explicit `draft` / `published` target rather than inferring from `findByID` without `draft: true`. Otherwise "Publish" silently no-ops on docs that already have a published version.
- Moderation queue queries must pass `draft: true` and avoid global NSFW / time filters that exclude pending items.

### Field-level access in feeds

- Do **not** select `links.spamProbability` or `links.ragebaitProbability` in public / non-moderator feed queries — field-level access blocks them and causes 400 errors in SSR. Use public fields (`controversial`, `score`, `upvotes`, `rankingScore`).

### Main feed behaviour

- Main feed = `feed=main` ∪ promoted subfeed links. Promotion = `featured=true` OR threshold gate on score/upvotes/rankingScore with `controversial != true`.
- Opt-in mixing via `?mixSubfeeds=true` adds all links from joined subfeeds. Persistence is cookie-based (`mixSubfeeds`) via a server action; the toggle lives on the Home page UI, not user settings. Home falls back to the cookie when the query param is absent.

### Subfeed authorisation

- Author membership / moderator status must be enforced at the **collection-hook** level for subfeed-targeted links/posts, not only in UI/actions.

### UI primitives

- Use the reusable modal at `src/components/ui/modal.tsx` (Radix Dialog + tw-animate) instead of ad-hoc modal logic.
- Follow `src/components/ui/select.tsx` for canonical Tailwind variants: `data-placeholder:…`, `data-disabled:…`, `h-(--var)` / `min-w-(--var)`, tokenised sizes like `min-w-32`.

### SSR/CSR hydration

- If hydration fails around Radix dropdown trigger IDs in a server-rendered header, move the menu into a mounted client component (useEffect gate) so SSR/CSR markup matches.

### Tests

- Integration tests creating `links` must use unique title/url values — slug validation fails on repeated fixtures across runs.
- Creating `subfeeds` in strict-typed fixtures requires explicitly setting `slug` even though hooks generate it at runtime.
- `tests/vitest/utils/test-user.ts` promise-locks `getPayload` init; keep `fileParallelism: false` in `vitest.config.mts` to avoid enum-creation races.

### Seeder

- When vote uniqueness is enforced, preload existing votes into a seen-set.
- For subfeed-targeted content, only seed into subfeeds where the author is a member/moderator.
- Curated post-title prefixes collide on unique slugs — maintain a seen slug/title set when generating titles.

## Security rules (non-negotiable)

These are the project's hard rules. See `.agents/skills/payload/reference/ACCESS-CONTROL.md` and `HOOKS.md` for full background.

1. **Local API + user**: whenever you pass `user` to `payload.find/create/update/delete`, also pass `overrideAccess: false`. Omitting it silently runs as admin.
2. **Hook atomicity**: always thread `req` through nested `payload.*` calls inside hooks, or you break the surrounding transaction.
3. **Hook loops**: when a hook re-writes its own collection, pass `context: { skipHooks: true }` (or a domain-specific flag) and early-return on it.
4. **Field-level access** can only return `boolean`, never a query constraint.
5. New roles referenced in access fns must actually exist on the `Users.roles` field options.

## What to load for Payload questions

For anything beyond the project-specific rules above, read `.agents/skills/payload/SKILL.md` — it has a quick-reference table that links into the topic files under `.agents/skills/payload/reference/` (collections, fields, hooks, access control, queries, endpoints, adapters, plugin development, field type guards, advanced).
