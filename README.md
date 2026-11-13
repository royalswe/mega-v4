# v4 — Existenz Next Community Engine

Next.js 16 + Payload 4 community/link-aggregation platform (Reddit / Hacker News / old-school forums vibe).

See [FEATURE.md](FEATURE.md) for the product spec, [IMPROVEMENTS.md](IMPROVEMENTS.md) for the roadmap, and [AGENTS.md](AGENTS.md) for the contributor / AI-agent guide.

## Stack

- Next.js 16 (App Router) + React 19
- Payload 4.0 (beta) with `@payloadcms/db-postgres`
- Lexical 0.53
- Tailwind v4 + Radix UI primitives
- Vitest (integration) + Playwright (e2e)
- pnpm

## Local setup

1. Clone the repo and `cd` into it.
2. `cp .env.example .env` and fill in `DATABASE_URL` (Postgres) and `PAYLOAD_SECRET`.
3. `pnpm install`
4. `pnpm dev` — opens at <http://localhost:3000>; admin panel at `/admin`.

### Docker

A `docker-compose-dev.yml` is provided for a local Postgres instance:

```bash
docker compose -f docker-compose-dev.yml up -d
```

Set `DATABASE_URL` in `.env` to match the compose file before running `pnpm dev`.

## Scripts

| Command                             | Purpose                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                          | Next dev server                                                              |
| `pnpm run generate:types`           | Regenerate `src/payload-types.ts` (run after any collection change)          |
| `pnpm run generate:importmap`       | Rebuild admin import map (run after adding/changing custom admin components) |
| `pnpm run typecheck`                | `tsc --noEmit`                                                               |
| `pnpm run lint`                     | ESLint                                                                       |
| `pnpm run test`                     | Vitest integration + Playwright e2e                                          |
| `pnpm run test:int`                 | Vitest only                                                                  |
| `pnpm run test:e2e`                 | Playwright only                                                              |
| `pnpm run migrate -- --name <name>` | Create a new Payload migration                                               |
| `pnpm run seed`                     | Run the seeder                                                               |

## Curated demo seed

`pnpm run seed` builds a small, deterministic fictional community (8 personas, 3
SubFeeds, 10 links, 8 posts, comments, votes, bookmarks, discoveries and
reports). Every row has a stable natural key, so a second run reconciles the same
records instead of appending another random community.

**Always point `DATABASE_URL` at an isolated database.** The seeder never wipes
or truncates anything, but it is still a demo dataset and must not run against a
shared or production database.

### Fresh isolated database

```bash
# From the host, using the Postgres container from docker-compose-dev.yml:
docker exec v4-postgres-1 psql -U royal -d postgres \
  -c "CREATE DATABASE v4_seed_check OWNER royal"

DATABASE_URL='postgres://royal:passw0rd@127.0.0.1:5432/v4_seed_check' \
  pnpm payload migrate

DATABASE_URL='postgres://royal:passw0rd@127.0.0.1:5432/v4_seed_check' \
  pnpm run seed
```

If you run Postgres directly on the host, `createdb v4_seed_check` is the
equivalent first step.

### Reference time

One reference time anchors every time-sensitive fixture (`createdAt`, editorial
priority, discovery timestamps). Persona activity stays anchored to the actual
run clock so pinning a historical reference time cannot decay earned roles below
the manifest.

- Default: the moment the run starts.
- Override: `SEED_REFERENCE_TIME='2026-11-12T09:00:00Z'` (any `Date.parse`-able
  ISO timestamp). An invalid value fails the run with an actionable error.

Reruns are row-idempotent: users, SubFeeds, content and interactions are matched
by natural key, so the second run creates **0** rows. Records that carry a
reference-time offset (for example discovery `discoveredAt`) are reconciled to
the new reference time, and person signal scores are re-applied after the
interaction hooks run.

Reconciliation also restores removed fixture replies to visible and returns the
pending-post scenario to pending after publication, using the seeded moderator's
normal authorization path.

### Verification

The seed scenario spec is opt-in so the normal suite never depends on demo data:

```bash
DATABASE_URL='postgres://royal:passw0rd@127.0.0.1:5432/v4_seed_check' \
SEED_VERIFY=1 pnpm exec vitest run tests/vitest/int/seed-scenarios.int.spec.ts
```

It runs the seed twice, checks effective roles/standing, SubFeed publishing
eligibility, promotion/safety visibility and second-run row counts. Without
`SEED_VERIFY=1` the database scenarios are skipped; database-free reconciliation
regressions still run. Row counts are scoped to seed-owned records so unrelated
fixture writes do not affect the idempotency comparison.

### Scenario manifest

| Persona  | Scenario                                                      | Expected visibility                                                                                 |
| -------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `astrid` | Newcomer: 0 SubFeeds, personal feed only                      | Own link + post publicly readable; one link and one post promoted to the Main Feed                  |
| `malin`  | Membership-only participant                                   | Personal link + post public; pending draft hidden from readers; **0** SubFeed items                 |
| `soren`  | Owner `nordic-indie-web`, uploader `applied-ai-notes`         | Promoted SubFeed link in nordic-indie-web; unpromoted local post in applied-ai-notes                |
| `linnea` | Local uploader `nordic-indie-web` only                        | Public SubFeed link/post in nordic-indie-web; no Main Feed publishing, no other SubFeeds            |
| `henrik` | Owner `craft-design-systems`, local editor `nordic-indie-web` | Promoted craft link; unpromoted focus-ring post; controversial link visible but never promoted      |
| `freja`  | Site editor, owner `applied-ai-notes`                         | Two native Main Feed items with active 24h editorial priority                                       |
| `kalle`  | Site moderator                                                | No authored content; reviews the seeded moderation reports                                          |
| `alva`   | Site administrator                                            | Native Main Feed link with expired editorial priority; quarantine authority for the disputed mirror |

Scenario roles are asserted by the seed itself: promoted items satisfy
`isEligibleForMainFeedPromotion`, unpromoted/pending/quarantined/controversial
items do not, native `feed: 'main'` content is visible through
`buildMainFeedWhere`, and origin (`user` / `subfeed` / `main`) is preserved.

## Project layout

See [AGENTS.md](AGENTS.md#repo-layout) for the canonical repo layout and conventions.
