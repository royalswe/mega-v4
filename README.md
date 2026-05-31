# v4 — Existenz Next Community Engine

Next.js 16 + Payload 3 community/link-aggregation platform (Reddit / Hacker News / old-school forums vibe).

See [FEATURE.md](FEATURE.md) for the product spec, [IMPROVEMENTS.md](IMPROVEMENTS.md) for the roadmap, and [AGENTS.md](AGENTS.md) for the contributor / AI-agent guide.

## Stack

- Next.js 16 (App Router) + React 19
- Payload 3.85 with `@payloadcms/db-postgres`
- Lexical 0.35 (pinned via Payload)
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

## Project layout

See [AGENTS.md](AGENTS.md#repo-layout) for the canonical repo layout and conventions.
