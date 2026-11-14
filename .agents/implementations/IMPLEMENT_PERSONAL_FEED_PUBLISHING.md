# Implementation Guide: Personal-First Publishing

Use this guide when implementing the publishing-first milestone in [#22](https://github.com/royalswe/mega-v4/issues/22). The GitHub issues are the acceptance-criteria source of truth; reread them and this repository's current code before starting, since implementation details and line numbers can change.

## Goal

Make each ordinary member's own User Feed the natural starting place for publishing. Links and posts should be publicly readable there when existing safety checks allow. Members should understand the actual result and be able to reach their submission. Eligible engagement can earn wider Main Feed reach; neither a Subfeed nor Main Feed placement is a prerequisite to contributing.

This is publishing-entry work, not the full User Feed discovery redesign or a rewrite of feed ranking.

## Confirmed product decisions

- New links and posts from ordinary members target only their own User Feed.
- Personal content publishes immediately when existing moderation and safety checks allow. If the actual outcome is pending or blocked, report that honestly; never represent it as public.
- Membership in a Subfeed alone does not grant publishing permission there.
- Retain authorised Subfeed-local publishing and existing site-wide editorial privileges, with their current scopes. Local authority is not global authority.
- A published personal feed is public, not private. Do not add a privacy setting or describe it as private.
- Preserve existing Main Feed promotion, moderation, ranking, editorial priority and safety rules.
- Do not automatically publish historical drafts or pending content.
- Refactor the default seed into a small, readable fictional community for a fresh isolated test database. Use meaningful names and topical content, not bulk random identities, Lorem ipsum or numeric title suffixes.

## Task order and dependencies

Complete the issues in dependency order; use their current GitHub status and blocked-by relationships to confirm readiness.

1. **[#23 — Enforce personal-first publishing and consistent destination eligibility](https://github.com/royalswe/mega-v4/issues/23)** — prerequisite; can start first.
2. **[#27 — Refactor seed into readable curated scenarios for a fresh test database](https://github.com/royalswe/mega-v4/issues/27)** — depends on #23; can proceed alongside #24/#25.
3. **[#24 — Make Home and submission forms start with Add to your feed](https://github.com/royalswe/mega-v4/issues/24)** — depends on #23.
4. **[#25 — Show truthful publication outcomes and a path to the submitted item](https://github.com/royalswe/mega-v4/issues/25)** — depends on #23 and #24.
5. **[#26 — Verify newcomer publishing journeys and document the personal-first model](https://github.com/royalswe/mega-v4/issues/26)** — depends on #23, #24, #25 and #27.

The parent issue #22 contains the overall goal and scope. Do not silently fold the separate User Feed discovery or feed-count/composition candidates into this milestone.

## Before changing code

1. Read the root [AGENTS.md](../../AGENTS.md) and follow its Payload security, feed and testing rules.
2. Read the selected issue and its acceptance criteria. Inspect the current implementation rather than relying on the source locations recorded in the issue.
3. For Payload collections, hooks, access rules or Local API behavior, read [the Payload skill](../skills/payload/SKILL.md) and only the reference pages it points to that are relevant.
4. Before changing Next.js code, read the installed Next.js guide under `node_modules/next/dist/docs/` for the APIs involved. This project uses a Next.js version with breaking changes.
5. Check the worktree and preserve unrelated user changes. Do not use destructive Git commands or commit/push; repository instructions permit read-only Git commands only.

## Implementation sequence

### #23: Enforce policy at the authoritative seam

Inspect the current link and post actions, collection access/hooks, explicit publication state transitions, and existing Subfeed membership/local-role checks. Relevant paths include:

- `src/app/actions/links.ts`
- `src/app/actions/posts.ts`
- `src/collections/Links/index.ts`
- `src/collections/Posts/index.ts`
- `src/lib/community/` for existing policy that should be reused rather than duplicated
- `tests/vitest/int/subfeed-eligibility.int.spec.ts`
- `tests/vitest/int/subfeed-targeting.int.spec.ts`
- `tests/vitest/int/subfeed-roles.int.spec.ts`

Keep destination authorization at collection enforcement as well as action validation; the UI is not a security control. Make link and post actions agree with the state the collections actually persist. Reject forged destinations and attempts to write into another member's User Feed. Do not change update behavior in a way that lets ordinary users bypass creation policy or existing moderation.

Reuse existing role/standing policy; do not implement a second copy of role eligibility. Preserve Subfeed-local scope and existing site-wide editorial capabilities. Do not weaken safety checks to force an immediate-publication result.

Only change schema if investigation establishes it is necessary. If a collection changes, follow the repository rule: run `pnpm run generate:types` before interpreting TypeScript errors, inspect any migration implications, and update fixtures/seeds where required. Never hand-edit generated `src/payload-types.ts`.

### #27: Seed a readable community on a fresh test database

Refactor the existing pipeline at `src/scripts/seed/seed.ts` and its modules under `src/scripts/seed/seeders/`. Keep `pnpm run seed` as the entry point. Inspect all affected seeders and their hook effects before deciding the smallest implementation; do not introduce a generic fixture framework.

Replace the default bulk/random community with a compact curated dataset. Usernames, bios, Subfeed names, content titles/bodies and conversations should make sense together. Prefer fictional personas with clear interests and relevant comments/replies. No Lorem ipsum, random numeric title suffixes or repeated generic templates. Use reserved example domains for fictional contact details; do not introduce real personal data or committed secrets.

Include named scenarios that make the publishing model inspectable:

- A newcomer with no joined Subfeeds and readable personal links/posts.
- A membership-only participant who cannot publish into their joined Subfeed.
- Authorised local publishers whose Subfeed authority does not become global.
- A site-wide editorial publisher and an administrator for existing safety workflows.
- Personal/Subfeed content that remains local and content that qualifies for Main Feed promotion, with its original destination preserved.
- Small, coherent conversations and engagement records; existing safety-state examples only where supported.

Use stable semantic fixture identifiers and deliberate relationships rather than random authors/destinations. Verify effective roles and visibility after hooks, not just requested role/status fields. Align Subfeed targeting with #23: the existing membership-only selection in link/post seeds must not survive as a shortcut. Keep required vote uniqueness and same-target reply relationships.

Make scenario identities, associations and expected states reproducible; document one reference time per run for recency-sensitive data. A second run must not create another community or duplicate interactions, nor overwrite unrelated user-created data. Deliberately reconcile existing seed-owned records or fail with actionable diagnostics if required scenarios cannot be established. Do not silently skip required fixtures and report success.

Keep the default seed independent of scraping, AI text generation and live metadata fetching. Authored metadata and existing/local assets should be enough to create the dataset. Reuse normal user authorization (`user` plus `overrideAccess: false`) for user-behavior operations. Keep necessary trusted bootstrap explicit and separate from authorization verification.

Document safe fresh-database preparation using the repository's actual schema/migration setup, seed invocation, a readable scenario manifest, reference-time behavior and rerun expectations. Do not add an automatic wipe or run against an existing/shared/production database. Fresh-database verification is future implementation work, not permission to reset the current database.

### #24: Align entry journeys with the policy

Inspect and update the current Home contribution experience and standalone forms, including:

- `src/components/links/HomeContributeCard.client.tsx`
- `src/components/links/LinkSubmitForm.tsx`
- `src/components/posts/PostSubmitForm.tsx`
- `src/components/subfeeds/SubmissionDestinationFields.tsx`
- `src/app/(frontend)/new-link/page.tsx` and the current post-submission route
- `src/lib/dictionaries.ts`

Ordinary members should be able to start from Home without joining or creating a Subfeed. Make their own User Feed the default for both content kinds. Show a destination choice only when the member has a meaningful authorized choice. Preserve existing privileged publishing entry paths and eligible Subfeed context.

Have the UI consume the authoritative eligibility/outcome from #23 rather than duplicating destination policy in forms. Keep useful rendering reuse, but do not add a shallow forwarding module. Use existing modal, form, focus and localization patterns. English and Swedish copy must not imply privacy or guaranteed Main Feed promotion.

### #25: Report the actual result

Trace the persisted action outcome into each form and Home modal. For both links and posts, make successful submission lead to the actual created item and identify its destination. Confirm public visibility only when the persisted result is public. Explain existing pending or blocked outcomes without a success-shaped fallback.

On failure, retain useful input and show an actionable error. Avoid silent catches or closing/resetting the form as though creation succeeded. Keep item links within the viewer's access rights. Do not infer publication state from the selected destination or repeat #23's policy in the UI.

### #26: Verify the full user experience

Use existing test fixtures and conventions. Cover a newcomer without joined Subfeeds from Home and standalone submission for both a link and a post. Verify the actual destination and public readability independently from toast text or owner visibility. Keep the suite focused rather than testing every combination.

After #27, prepare a fresh isolated test database, run the seed, verify the documented scenarios and run it again to check repeat-run behavior. Inspect the seeded Home/personal/Subfeed experience with the completed publishing UI. Keep existing integration tests independent where appropriate; do not make every test depend on the complete demo seed.

Retain coverage for denied membership-only Subfeed targeting and authorized local publishing; integration tests from #23 should cover direct/tampered requests. If the existing safety setup permits a deterministic pending/blocked case, assert truthful feedback without weakening production rules or introducing a production-only testing switch.

Update the existing English and Swedish How it works/publishing guidance as appropriate. Explain that ordinary publishing starts in a public User Feed, engagement can earn Main Feed reach, Subfeeds are earned editorial spaces, and joining a Subfeed alone does not grant publishing rights. A Subfeed is not a mandatory rung on the way to Main Feed. Do not publish internal numeric ranking thresholds or promise promotion.

## Non-negotiable Payload safeguards

- When passing `user` to `payload.find/create/update/delete`, also pass `overrideAccess: false`.
- Thread `req` through nested Payload calls in hooks to preserve transaction atomicity.
- When a hook updates its own collection, use the existing skip-hook/context pattern and return early on that context.
- Enforce Subfeed membership and local publishing authority in collection hooks, not only in UI/actions.
- Field-level access returns booleans, not query constraints.
- Preserve explicit `draft`/`published` targets; do not infer a publish transition from a default `findByID`.
- Keep new or referenced roles consistent with actual `Users.roles` options.

## Validation

Prefer the smallest targeted commands for each issue, then validate the integrated milestone:

```bash
pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts tests/vitest/int/subfeed-targeting.int.spec.ts tests/vitest/int/subfeed-roles.int.spec.ts
pnpm run typecheck
pnpm run lint
```

For browser coverage, use the existing Playwright configuration and the relevant newcomer journey spec (likely alongside `tests/playwright/e2e/progression.e2e.spec.ts`); inspect package scripts and test setup before selecting the exact invocation. Run the focused browser test first, then the narrow integration tests affected by the change. Do not claim a test passed unless it ran successfully. Report environment blockers explicitly.

Integration test data creating links must use unique titles and URLs so slug validation does not collide across runs. If creating Subfeeds in strict-typed fixtures, include `slug`. Keep Vitest `fileParallelism: false`.

For #27, run `pnpm run seed` only after confirming the configured target is the intended fresh isolated test database. Verify the scenario manifest, public readability, effective publishing permissions and relationship integrity, then rerun the seed and confirm stable identities without duplicated interactions. Log actual failures explicitly; do not count a partial seed as success.

## Out of scope

- Full User Feed profile/navigation/discovery redesign.
- Feed count-to-click or feed-composition corrections.
- Merging Home links and Wall posts into one reading surface.
- New private-feed visibility controls.
- Standing formula, score weights, role progression, Subfeed governance or promotion-policy changes.
- Subfeed ads, donations or economy features.
- Retrospective publication or migration of existing drafts/pending content.
- Automatic database resets, seeding shared/production data, or bulk stress/load-data generation.
- New generic feed framework, storage adapter or abstraction without a demonstrated second implementation.

## Completion handoff

Before considering #22 complete, verify all five child tasks and their dependencies, including fresh-database seed/rerun verification. Preserve existing standing/promotion/editorial-priority/safety tests, and summarize changed files, behavior, commands run and any unverified environmental limitation. Keep the guide and issue tracker aligned if implementation reveals a necessary product decision; ask before changing confirmed behavior.
