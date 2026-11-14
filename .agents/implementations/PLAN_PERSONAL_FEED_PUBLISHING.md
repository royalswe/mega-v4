# Implementation Plan: Personal-First Publishing (#22)

- **Status**: ✅ Complete — #23, #27, #24, #25, #26 all implemented and verified (review gates passed for #23 and #27). Follow-up: **Bobhund mechanics bundle** implemented (dynamic trust thresholds, editorial-priority expiry, SubFeed > User Feed priority, Likability/relative-rank SubFeed gate).
- **Branch**: `bobhunds-suggestions` (tracking `origin/bobhunds-suggestions`)
- **Parent Issue**: [#22 — Publishing-first UX: make the User Feed the newcomer starting point](https://github.com/royalswe/mega-v4/issues/22)
- **Companion Guide**: `.agents/implementations/IMPLEMENT_PERSONAL_FEED_PUBLISHING.md`

This document is the step-by-step execution specification for the personal-first publishing milestone (#22, child issues #23 → #27 → #24 → #25 → #26). Every architectural seam, policy rule, data contract, file path, and verification command has been pre-resolved against the live repository so a fast implementation agent (`opencode-go/deepseek-v4.1-flash`) can execute each step deterministically without inventing policy, widening scope, or re-deriving design choices. Where `.agents/implementations/IMPLEMENT_PERSONAL_FEED_PUBLISHING.md` or issue bodies have stale paths or line references, the code findings in this plan take precedence.

### Execution Log & Deviations

| Issue | State                                                       | Verified with                                                                                                                                                                                                                                    |
| :---- | :---------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #23   | **Done** (implemented + reviewed + fixes applied)           | `pnpm run test:int` → 13 files / 124 tests pass; `pnpm run typecheck` → clean. `pnpm run lint` is broken repo-wide at plugin load (`typescript-eslint does not support TS 7.0`) and cannot be used as a gate until the ESLint stack is upgraded. |
| #27   | **Done** (review: SHIP WITH FOLLOW-UPS, follow-ups applied) | Isolated DB `v4_seed_check`: seed run twice → second run creates 0 rows in all 9 collections; `SEED_VERIFY=1 vitest run seed-scenarios.int.spec.ts` → 8/8; `pnpm run typecheck` clean.                                                           |
| #24   | **Done** (review: SHIP)                                     | `pnpm run test:int` → 128 pass; `pnpm run typecheck` clean; prettier clean on changed files.                                                                                                                                                     |
| #25   | **Done** (review: SHIP)                                     | `pnpm run test:int` → 131 pass; `pnpm run typecheck` clean; prettier clean.                                                                                                                                                                      |
| #26   | **Done** (review: SHIP WITH FOLLOW-UPS, follow-ups applied) | `playwright test progression.e2e.spec.ts` → 16/16; targeted vitest (5 specs) → 102 pass; `pnpm run test:int` → 131 pass / 8 skipped; `pnpm run typecheck` clean; seed rerun → 0 duplicates; `SEED_VERIFY=1` spec → 8/8.                          |

Deviations from the text below that later issues must respect (#23):

1. `payload.create({ draft: true })` and admin autosave are respected: `recordDraftIntent` (`src/lib/community/subfeeds.ts`) is wired as a `beforeOperation` hook on `Links` and `Posts` and records explicit draft intent in `req.context.explicitDraftIntent` **before** Payload defaults `_status`. The publish defaults in `prepareLink`/`preparePost` skip when that flag is set — so a `pending` link fixture via `draft: true` still works as #25 Step 25.3 describes.
2. `featured` on `Links` and `Posts` is now field-level gated to `canManageSubmittedLinks` (create + update). Fixtures/reconciliation passes that set `featured` must use `overrideAccess: true` (no `user`) — the `#27` signal reconciliation pass already does.
3. Destination coherence lives in `normalizeContentDestination` (`subfeeds.ts`): an update leaving `feed: 'subfeed'` detaches `subfeed` to `null`; a new `subfeed` without `feed` selects `feed: 'subfeed'` on create or on a real relation change only.
4. In-place updates on existing SubFeed items (click counts, `recalculateTargetSignals`, curation, author edits) do **not** re-check the author's local publishing role; only create or an actual feed/subfeed/author change does.
5. `derivePersistedPublicationState` takes a structural `PersistedPublicationDoc`, not `Record<string, unknown>`.
6. `tests/vitest/int/helpers.ts#createTestUser` now appends a random suffix to username/email — the previous faker-only values collided against accumulated test-account data and intermittently failed the suite.
7. Destination labels returned by the actions are English literals (`'Your User Feed'`, `'Main Feed'`, SubFeed name) — #25 localises presentation copy, not this label.

Deviations from the text below that later issues must respect (#24 / #25 / #26):

8. `SubmissionOutcomeBanner` plus `getSubmissionOutcomeCopy` / `OUTCOME_BANNER_CLASSES` are exported from `src/components/links/LinkSubmitForm.tsx` and reused by `PostSubmitForm` and `HomeContributeCard` — there is no separate outcome component file.
9. In edit mode (`QuickEditLinkButton`) the form calls `onSuccess` through a documented zero-argument cast: the admin quick-edit action produces no `SubmissionOutcome`, so no banner is rendered on that path.
10. `/how-it-works` and `/hur-det-funkar` keep all pre-existing section headings but replace every public numeric progression/promotion threshold and raw weight formula with qualitative copy. `trustLevelNotes` maps one description per `TRUST_LEVEL_THRESHOLDS` entry so level names stay in sync with the code; the numeric bands are no longer rendered.
11. `tests/playwright/e2e/progression.setup.ts` adds `localmod` as a plain `members` entry of `adminSubfeed` (the newcomer stays in 0 SubFeeds). The #26 e2e block asserts: newcomer Home link journey + compact outcome bar, newcomer `/new-post` journey, membership-only denial on `adminSubfeed`, owner publishing on `qualifiedSubfeed`, and EN/SV docs copy with no numeric formulas.
12. `pnpm run lint` remains unusable in this environment (see #23 row); formatting was validated with `pnpm exec prettier --check` on every touched file.
13. Post-review follow-ups: Swedish `submissionOutcome` copy uses gender-neutral `Ditt bidrag …` (avoids `Din inlägg`/`Din länk` mismatch); the #26 e2e block no longer double-clicks `Share a link` outside `toPass()`; every anonymous browser context is closed in `try/finally`.
14. **Bobhund mechanics bundle** (follow-up to the #22 audit): (a) `ranking.ts` gains `SUBFEED_PRIORITY_BOOST` + `feed` origin input so SubFeed content outranks User Feed content; (b) `editorialPriority.ts` sweeps expired editorial windows at feed render time (recompute + clear flag) and `promotion.ts` gives SubFeed origin a discounted promotion gate (`SUBFEED_PROMOTION_DISCOUNT = 0.75`); (c) `trustDynamics.ts` + `CommunityDynamics` global make trust thresholds population-relative with EMA smoothing (enabled only when `NODE_ENV === 'production'` or `TRUST_DYNAMICS_ENABLED=true`, so dev/test/e2e stay deterministic); (d) `subfeedEligibility.ts` adds a `community-standing` path (Contribution + Likability + optional top-decile relative rank). New migration `20261113_054453_community_dynamics`.

---

## A. Agent Workflow & Operating Model

### Model Tiers (`opencode.json`)

| Role                  | Configured Agent (`opencode.json`) | Model ID                          | Responsibility                                                                                                 |
| :-------------------- | :--------------------------------- | :-------------------------------- | :------------------------------------------------------------------------------------------------------------- |
| **Planning & Review** | `plan`, `planner`, `reviewer`      | `opencode-go/gemini-4-argon`      | Architecture, policy design, review gates, resolving discovered questions, updating this plan.                 |
| **Implementation**    | `build`, `implementer`             | `opencode-go/deepseek-v4.1-flash` | Executing one approved step block at a time, running targeted tests/typecheck/lint, reporting verbatim output. |
| **Reconnaissance**    | `explore`                          | `opencode-go/claude-haiku-5-5`    | Fast read-only file/symbol searches when the planner needs additional context.                                 |

> **Upgrade Note**: `opencode/claude-opus-5-5` is the intended upgrade for the Planning & Review tier (`plan`, `planner`, `reviewer`) once organization balance is topped up — a single-line swap per agent in `opencode.json`.

### Execution Loop Per Issue

1. **Fixed Decisions**: All design decisions are locked in Section C.4 of the active issue.
2. **Single-Block Execution**: The implementer (`opencode-go/deepseek-v4.1-flash`) runs **one** ordered step block (or one issue's step sequence when handed off as a unit) and stops.
3. **Evidence Report**: The implementer reports touched files, exact commands run, and verbatim terminal output.
4. **Review Gate**: The reviewer (`opencode-go/gemini-4-argon`) checks the diff and test output against the issue's Definition of Done (Section C.8) and Safeguards (Section C.6).
5. **Plan Maintenance**: If an unexpected code discrepancy or environment blocker surfaces, the implementer stops immediately and escalates to the planner to resolve and update this plan before further edits.

### Hard Rules for the Cheap Implementer (`opencode-go/deepseek-v4.1-flash`)

1. **Never invent policy**: Consume the exact functions, types, and conditions specified in this plan. Do not add new roles, standing thresholds, or privacy toggles.
2. **Stop and report if code diverges**: If a target file's existing logic no longer matches the Findings in Section C.3, halt and report the diff to the planner instead of guessing.
3. **Never widen scope**: Touch only the files listed in the active step block. Do not refactor unrelated feed queries, profile tabs, or ranking formulas.
4. **Never claim a test passed without verbatim output**: Every `[test]` step and verification gate requires running the command and pasting its actual exit status and summary.
5. **Never hand-edit `src/payload-types.ts`**: If a collection config changes (none are planned; only hook/default behavior), run `pnpm run generate:types`.
6. **Read-only Git**: Never run `git commit`, `git push`, `git reset`, `git checkout`, or `git clean`. Only read-only Git inspection (`git status`, `git diff`) is allowed.

### Copy-Paste Implementer Kickoff Prompt Template

```text
You are the implementation agent (opencode-go/deepseek-v4.1-flash) working in /Users/royal/www/v4.
Execute ONLY Issue #<ISSUE_NUMBER> (<ISSUE_TITLE>) from `.agents/implementations/PLAN_PERSONAL_FEED_PUBLISHING.md`.

Before editing any file:
1. Read `AGENTS.md` and `.agents/implementations/PLAN_PERSONAL_FEED_PUBLISHING.md` Section A and Section C.<ISSUE_NUMBER>.
2. Read the exact Next.js docs and Payload skill references listed in Section C.<ISSUE_NUMBER>.
3. Follow the ordered steps [impl]/[test] in Section C.<ISSUE_NUMBER>.5 in exact order.
4. Obey all hard rules: do not invent policy, do not widen scope, do not hand-edit `src/payload-types.ts`, and use read-only git commands only.
5. Run every verification command in Section C.<ISSUE_NUMBER>.7 and report the changed files, commands executed, and verbatim command output. Stop immediately if any stop-and-ask trigger in Section C.<ISSUE_NUMBER>.8 fires.
```

### Copy-Paste Review Gate Prompt Template

```text
You are the review agent (opencode-go/gemini-4-argon) in /Users/royal/www/v4.
Review the work completed for Issue #<ISSUE_NUMBER> against `.agents/implementations/PLAN_PERSONAL_FEED_PUBLISHING.md` Section C.<ISSUE_NUMBER>.

1. Run `git status --short` and `git diff` to inspect all modified and added files.
2. Check every item in:
   - Acceptance Criteria (C.<ISSUE_NUMBER>.2)
   - Locked Design Decisions (C.<ISSUE_NUMBER>.4)
   - Payload & Next.js Safeguards (C.<ISSUE_NUMBER>.6)
   - Definition of Done (C.<ISSUE_NUMBER>.8)
3. Verify that the implementer ran the exact verification commands in C.<ISSUE_NUMBER>.7 and that all tests, `pnpm run typecheck`, and `pnpm run lint` succeeded with verbatim output.
4. Return PASS (ready for next milestone / checkpoint) or FAIL with exact file:line citations and corrective instructions for the implementer.
```

---

## B. Milestone Map & Checkpoints

| Order |  Issue  | Title                                                                     |     Depends On     | Key Deliverable                                                                                                                                                              | Human Checkpoint                                                                                                                    |
| :---: | :-----: | :------------------------------------------------------------------------ | :----------------: | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| **1** | **#23** | Enforce personal-first publishing and consistent destination eligibility  |        None        | Authoritative publishing policy in `src/lib/community/subfeeds.ts`, collection hooks in `Links` & `Posts`, server actions in `links.ts` & `posts.ts`, and integration specs. | **Checkpoint 1 (After #23)**: Confirm policy enforcement, hook behavior, and integration test pass before seeding or UI work.       |
| **2** | **#27** | Refactor seed into readable curated scenarios for a fresh test database   |        #23         | Deterministic curated fictional community in `src/scripts/seed/`, rerun reconciliation, and fresh-DB documentation.                                                          | **Checkpoint 2 (After #27)**: Human confirms isolated test DB target (`DATABASE_URL`) before running/rerunning `pnpm run seed`.     |
| **3** | **#24** | Make Home and submission forms start with Add to your feed                |        #23         | Personal-first Home contribute card, destination selector hidden when only User Feed is allowed, SubFeed context preserved, EN/SV copy.                                      | None (proceeds directly to #25 after review gate).                                                                                  |
| **4** | **#25** | Show truthful publication outcomes and a path to the submitted item       |      #23, #24      | Action outcome contract consumed by `LinkSubmitForm`, `PostSubmitForm`, and `HomeContributeCard` with direct item links and honest pending/blocked/error states.             | None (proceeds to #26 after review gate).                                                                                           |
| **5** | **#26** | Verify newcomer publishing journeys and document the personal-first model | #23, #24, #25, #27 | Focused Playwright E2E newcomer journeys, `/how-it-works` & `/hur-det-funkar` copy alignment, and full milestone verification.                                               | **Checkpoint 3 (Before #26 Sign-off)**: Final human review of E2E results, fresh-DB seed/rerun transcript, and EN/SV documentation. |

---

## C. Issue-by-Issue Implementation Plan

### Issue #23: Enforce personal-first publishing and consistent destination eligibility

#### C.23.1 Objective

Make one owned policy govern where a member may publish links and posts and what publication state is persisted. Ordinary authenticated members publish immediately into their own publicly readable User Feed (`feed: 'user'`) when existing safety checks allow, and joining a SubFeed (`members`) no longer grants permission to publish into that SubFeed. Both server actions (`submitLink`, `submitPost`) and collection hooks (`Links`, `Posts`) enforce this policy authoritatively and return the actual persisted publication outcome.

#### C.23.2 Acceptance Criteria Checklist

- [ ] For an ordinary authenticated member without publishing privileges, new links and posts target only that member's own User Feed and become published/publicly readable when existing safety checks allow.
- [ ] Tampered Main Feed or SubFeed targeting is rejected explicitly through both submission actions and collection-level operations. Joining a SubFeed alone does not permit publication there.
- [ ] Author identity cannot be used to publish into someone else's personal feed.
- [ ] Authorised local publishing roles (`owner`, `moderator`, `editor`, `uploader`) retain their existing ability within their own SubFeed; unrelated SubFeeds and site-wide privileges remain unavailable. Preserve existing site-wide editorial privileges (`admin`, `moderator`, `editor`, `uploader`) and safety-authority scope (`admin`, `moderator`, `editor`).
- [ ] Actions, hooks and caller-visible outcomes agree about the actual persisted public/pending/blocked state. Do not turn a blocked operation into success or bypass moderation to satisfy immediate publication.
- [ ] Historical drafts/pending content remain unchanged; ordinary updates cannot bypass the new creation policy or existing safety controls.
- [ ] Keep hook transactions (`req` threading), existing loop guards, access enforcement and explicit draft/published transitions. Local operations supplied a user must retain `overrideAccess: false`.
- [ ] Add focused integration cases for both content kinds: personal creation AND public readability, denied membership-only targeting, authorised local publication, and cross-scope denial. Preserve existing safety/targeting/role coverage.

#### C.23.3 Findings from Current Code

- **`src/lib/community/subfeeds.ts:81-85` & `148-151`**: `canSubmitToSubfeed(subfeed, userId)` currently returns `roles.member || roles.uploader || roles.editor || roles.moderator || roles.owner`. Because `roles.member` is included, anyone who joins a SubFeed can publish into it. `isSubfeedMemberOrModerator` at line 148 is an alias to `canSubmitToSubfeed`.
- **`src/lib/community/subfeeds.ts:6-23`**: Already exports `canModerateCommunity(user)` (`['admin', 'moderator', 'editor']`) and `canManageSubmittedLinks(user)` (`['admin', 'moderator', 'editor', 'uploader']`). Reuse these directly instead of inventing new role checks.
- **`src/lib/community/subfeeds.ts:105-142`**: `enforceSubfeedContentTargetAccess` only guards `operation === 'update'` AND returns early at line 116 when `resolveID(originalDoc?.user) === req.user.id`. That means an ordinary author updating their own link or post can currently retarget `feed: 'main'`, `feed: 'subfeed'`, or change `user` to another member's ID.
- **`src/collections/Links/index.ts:223-284` & `477-494`**:
  - Field `feed` at line 479 has `defaultValue: 'main'`.
  - `prepareLink` (`beforeValidate`, line 223) checks `canSubmitToSubfeed(subfeed, authorId)` when `effectiveFeed === 'subfeed'`, but does **not** block an ordinary user (`req.user` without editorial role) from creating or updating a link with `feed: 'main'` or setting `user` to another user's ID.
  - `Links` has `versions: { drafts: { autosave: true, schedulePublish: true } }` (line 409). When created via `payload.create` with `draft: false` and `_status: 'published'` (or defaulted in `prepareLink`), it becomes published immediately unless quarantined/soft-deleted.
- **`src/collections/Posts/index.ts:157-237` & `630-653`**:
  - `preparePost` (`beforeValidate`, line 157) checks `canSubmitToSubfeed(subfeed, authorId)` for `effectiveFeed === 'subfeed'`, but does **not** block an ordinary user from passing `feed: 'main'` or another user's `user` ID.
  - At lines 221-234, `preparePost` sets `nextData.status = isSubfeedPost ? 'published' : 'pending'` for non-editorial users — this is why ordinary personal posts (`feed: 'user'`) become `'pending'` even though `submitPost` requests `'published'`.
- **`src/app/actions/links.ts:145-239`**:
  - `submitLink` only accepts `feed: 'main' | 'subfeed'` (missing `'user'`).
  - For `feed: 'subfeed'`, line 188 throws `'You must join this subfeed before posting'` (stale error message).
  - Lines 205-230 create a draft for non-subfeed links and do a two-step draft+update for subfeed links, returning `void`.
- **`src/app/actions/posts.ts:103-170`**:
  - `submitPost` accepts `feed: 'user' | 'subfeed'` (missing `'main'` for site-wide editorial publishers).
  - Line 142 throws `'You must join this subfeed before posting'`.
  - Returns `void` instead of the persisted outcome.
- **Existing tests to be aware of**:
  - `tests/vitest/int/editorial-priority-and-safety.int.spec.ts:233-255` & `319-331` and `tests/vitest/int/main-feed-promotion.int.spec.ts:82-147` call `payload.create` with `overrideAccess: true` and **no `user`** (`req.user` is `undefined`) to seed test fixtures on `feed: 'main'`.
  - `tests/vitest/int/subfeed-targeting.int.spec.ts:174-217` calls `payload.create` with `overrideAccess: true` (no `user`), passing `user: outsider.id, feed: 'subfeed', subfeed: subfeed.id`, and asserts `.rejects.toThrow(...)`.
  - `tests/vitest/int/subfeed-roles.int.spec.ts:203-210` tests `canSubmitToSubfeed(subfeed, 5)` expecting `true` for a plain member (`5`), and lines `347-433`, `498-666` create subfeed content via `createSubfeedLink(author, subfeed.id)` where `author` is only in `members`.
- **Required Payload & Next.js Docs to Read Before Coding**:
  - `.agents/skills/payload/SKILL.md`
  - `.agents/skills/payload/reference/HOOKS.md`
  - `.agents/skills/payload/reference/ACCESS-CONTROL.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`

#### C.23.4 Locked Design Decisions (Do Not Re-open)

1. **SubFeed Publishing Authority (`canSubmitToSubfeed`)**:
   - **Decision**: In `src/lib/community/subfeeds.ts`, change `canSubmitToSubfeed(subfeed, userId)` so it returns `roles.uploader || roles.editor || roles.moderator || roles.owner` (removing `roles.member`). Export error constant `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE = 'You need a local publishing role (uploader, editor, moderator, or owner) to publish to this SubFeed.'` and `MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE = 'Only site editors, uploaders, moderators, and administrators can publish directly to the Main Feed.'` and `FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE = 'You can only publish to your own User Feed.'`.
   - **Rationale**: Membership (`roles.member`) is for joining/reading/participating; SubFeed publishing is an earned or locally assigned editorial privilege.

2. **Authoritative Enforcement Seam (Collection `beforeValidate` Hooks + Action Validation)**:
   - **Decision**: Enforce destination and author policy in `src/lib/community/subfeeds.ts` via a shared helper `enforceContentPublishingPolicy` called from `Links` (`prepareLink`) and `Posts` (`preparePost`) `beforeValidate` hooks, **and** validate before write in `submitLink` / `submitPost`.
     - **SubFeed target (`effectiveFeed === 'subfeed'`)**: Always require a valid `subfeedId` on create. Unless `canModerateCommunity(req.user)` is true, resolve `authorId = resolveID(nextData.user ?? originalDoc?.user) ?? resolveID(req.user?.id)` and require `canSubmitToSubfeed(subfeed, authorId)` — throwing `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE` if false (this works whether `req.user` is set or `overrideAccess: true` is used in `subfeed-targeting.int.spec.ts`).
     - **Author identity (`user` field)**: Whenever `req.user` is present and `!canModerateCommunity(req.user)`:
       - On `create`: if `nextData.user !== undefined && resolveID(nextData.user) !== resolveID(req.user.id)`, throw `FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE`. Default `nextData.user = req.user.id`.
       - On `update`: if `nextData.user !== undefined && resolveID(nextData.user) !== resolveID(originalDoc?.user)`, throw `FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE` (unless the actor is a local SubFeed moderator moving content under `enforceSubfeedContentTargetAccess`).
     - **Main Feed target (`effectiveFeed === 'main'`)**: Whenever `req.user` is present:
       - On `create`, or on `update` when `originalDoc?.feed !== 'main'`: require `canManageSubmittedLinks(req.user)` (`admin`, `moderator`, `editor`, `uploader`); otherwise throw `MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE`. (When `req.user` is `undefined` in trusted `overrideAccess: true` test fixtures like `editorial-priority-and-safety.int.spec.ts:237`, allow creation so existing non-priority fixture tests keep working.)
     - **Self-update retargeting guard**: In `enforceSubfeedContentTargetAccess` (`src/lib/community/subfeeds.ts:105`), remove the blanket `resolveID(originalDoc?.user) === req.user.id` bypass. An ordinary author updating their own item may **not** change `user` to another user, may **not** change `feed` to `'main'` (unless `canManageSubmittedLinks(req.user)`), and may **not** change `feed` to `'subfeed'` or change `subfeed` unless `canSubmitToSubfeed(targetSubfeed, req.user.id)` (or `canModerateCommunity(req.user)`).
   - **Rationale**: Enforcing in `beforeValidate` protects REST, GraphQL, Local API with `overrideAccess: false`, and Server Actions alike, while preserving trusted `overrideAccess: true` fixture setup in existing integration suites.

3. **Default `Links.fields.feed` and Immediate Personal Publication**:
   - **Decision**:
     - Change `src/collections/Links/index.ts` field `feed` `defaultValue` from `'main'` to `'user'` (matching `Posts`). In `prepareLink`, on `operation === 'create'`, if `!nextData.feed`, set `nextData.feed = 'user'`; if `nextData._status === undefined && !req?.query?.draft`, set `nextData._status = 'published'`.
     - In `src/collections/Posts/index.ts` `preparePost`, on `operation === 'create'`, replace `nextData.status = isSubfeedPost ? 'published' : 'pending'` with: if `nextData.status !== 'removed'` and `nextData.quarantined !== true` and `req?.context?.forcePending !== true`, set `nextData.status = 'published'` (since unauthorized destinations have already been rejected earlier in `preparePost`). Historical pending/draft docs are untouched because this branch only runs on `operation === 'create'`.
   - **Rationale**: Ordinary personal links and posts must publish immediately on creation when safety checks allow, without silently publishing historical drafts/pending rows.

4. **Shared Destination Eligibility Helper & Return Shape Consumed by UI (`#23` → `#24`)**:
   - **Decision**: Export `getPublishingDestinationEligibility(user, subfeeds)` (and async loader `loadPublishingDestinationEligibility(payload, user)`) from `src/lib/community/subfeeds.ts` returning:
     ```ts
     export type PublishingFeedKind = 'user' | 'subfeed' | 'main'

     export interface EligibleSubfeedOption {
       id: number
       name: string
       slug: string
     }

     export interface PublishingDestinationEligibility {
       defaultFeed: 'user'
       allowedFeeds: PublishingFeedKind[]
       canPublishToMain: boolean
       eligibleSubfeeds: EligibleSubfeedOption[]
       hasMultipleDestinations: boolean
     }
     ```
     Where:
     - `defaultFeed` is always `'user'`.
     - `canPublishToMain` is `canManageSubmittedLinks(user)`.
     - `eligibleSubfeeds` filters `subfeeds` to those where `canModerateCommunity(user) || canSubmitToSubfeed(subfeed, user.id)`.
     - `allowedFeeds` always starts with `'user'`, includes `'subfeed'` iff `eligibleSubfeeds.length > 0`, and includes `'main'` iff `canPublishToMain` is true.
     - `hasMultipleDestinations` is `allowedFeeds.length > 1` (i.e., `canPublishToMain || eligibleSubfeeds.length > 0`).
   - **Rationale**: Gives `#24` a single authoritative, serializable contract so forms never compute role or SubFeed eligibility on their own.

5. **Persisted Publication Outcome Contract (`#23` → `#25`)**:
   - **Decision**: Both `submitLink` (`src/app/actions/links.ts`) and `submitPost` (`src/app/actions/posts.ts`) accept `feed?: 'user' | 'subfeed' | 'main'` (defaulting to `'user'`) and return a unified `SubmissionOutcome` derived from the actual persisted document returned by Payload:
     ```ts
     export type PublicationVisibilityState = 'published' | 'pending' | 'blocked'

     export interface SubmissionOutcome {
       kind: 'link' | 'post'
       id: number
       title: string
       feed: 'user' | 'subfeed' | 'main'
       visibility: PublicationVisibilityState
       isPublic: boolean
       itemHref: string | null
       destinationHref: string
       destinationLabel: string
       subfeed?: { id: number; name: string; slug: string }
       authorUsername: string
     }
     ```
     Where `visibility` is computed from the persisted document via a pure helper `derivePersistedPublicationState(kind, doc)` in `src/lib/community/subfeeds.ts`:
     - For `links`: if `doc.softDeleted === true || doc.quarantined === true` → `'blocked'`; else if `doc._status === 'published'` → `'published'`; else → `'pending'`.
     - For `posts`: if `doc.status === 'removed' || doc.quarantined === true` → `'blocked'`; else if `doc.status === 'published'` → `'published'`; else → `'pending'`.
     - `isPublic` is `visibility === 'published'`.
     - `itemHref` is `visibility === 'blocked' ? null : kind === 'link' ? \`/link/\${doc.id}\` : \`/post/\${doc.id}\``(since`readAccess`on`Links`and`Posts`allows the author to view their own`published`or`pending`/`draft`item, but blocks`quarantined`/`softDeleted`/`removed`).
     - `destinationHref` is `feed === 'subfeed' && subfeed ? \`/subfeeds/\${subfeed.slug}\` : feed === 'main' ? '/' : \`/user/\${encodeURIComponent(user.username)}?tab=\${kind === 'link' ? 'links' : 'posts'}\``.
   - **Rationale**: `#25` can render truthful public, pending, or blocked states and direct links straight from the server action return value without guessing.

#### C.23.5 Ordered Steps (`[impl]` / `[test]`)

- **Step 23.1 `[impl]` — Deepen `src/lib/community/subfeeds.ts` with publishing policy, eligibility, and outcome helpers**
  - **Goal**: Centralize SubFeed publishing eligibility, destination options, hook enforcement, and persisted state derivation in `src/lib/community/subfeeds.ts`.
  - **Files**: `src/lib/community/subfeeds.ts`
  - **Exact Change Intent**:
    1. Update `canSubmitToSubfeed(subfeed, userId)` to return `roles.uploader || roles.editor || roles.moderator || roles.owner` (remove `roles.member`).
    2. Export error message constants: `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE`, `MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE`, `FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE`.
    3. Export types `PublishingFeedKind`, `EligibleSubfeedOption`, `PublishingDestinationEligibility`, `PublicationVisibilityState`, `SubmissionOutcome`.
    4. Export `getPublishingDestinationEligibility(user, subfeeds)` and `loadPublishingDestinationEligibility(payload, user)` (using `payload.find({ collection: 'subfeeds', sort: 'name', depth: 0, limit: 200, user, overrideAccess: false })`).
    5. Export `derivePersistedPublicationState(kind: 'link' | 'post', doc: Record<string, unknown>): PublicationVisibilityState`.
    6. Update `enforceSubfeedContentTargetAccess` so that on `update`, even when `resolveID(originalDoc?.user) === req.user.id`, changing `user`, changing `feed` to `'main'` without `canManageSubmittedLinks(req.user)`, or changing `feed`/`subfeed` to a SubFeed without `canSubmitToSubfeed(targetSubfeed, req.user.id)` (unless `canModerateCommunity(req.user)`) is rejected with the corresponding error constant.
  - **Proving Command**: `pnpm run typecheck`

- **Step 23.2 `[impl]` — Enforce destination, author, and publication policy in `Links` and `Posts` collections**
  - **Goal**: Make `src/collections/Links/index.ts` and `src/collections/Posts/index.ts` enforce personal-first publishing and persist `'published'` state for permitted creations.
  - **Files**: `src/collections/Links/index.ts`, `src/collections/Posts/index.ts`
  - **Exact Change Intent**:
    1. In `src/collections/Links/index.ts`:
       - Change `feed` field `defaultValue` from `'main'` to `'user'`.
       - In `prepareLink`:
         - Default `nextData.feed` on `create` to `'user'` if undefined.
         - If `req.user` is present and `!canModerateCommunity(req.user)`: on `create`, if `nextData.user !== undefined && resolveID(nextData.user) !== resolveID(req.user.id)`, throw `FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE`; set `nextData.user = req.user.id`.
         - If `effectiveFeed === 'main'` and `req.user` is present and `(operation === 'create' || originalDoc?.feed !== 'main')` and `!canManageSubmittedLinks(req.user)`, throw `MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE`.
         - For `effectiveFeed === 'subfeed'`, when `!canSubmitToSubfeed(subfeed, authorId)`, throw `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE`.
         - On `operation === 'create'`, if `nextData._status === undefined && !req?.query?.draft && req?.context?.forcePending !== true`, set `nextData._status = 'published'`.
    2. In `src/collections/Posts/index.ts`:
       - In `preparePost`:
         - Default `nextData.feed` on `create` to `'user'` if undefined.
         - If `req.user` is present and `!canModerateCommunity(req.user)`: on `create`, if `nextData.user !== undefined && resolveID(nextData.user) !== resolveID(req.user.id)`, throw `FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE`; set `nextData.user = req.user.id`.
         - If `effectiveFeed === 'main'` and `req.user` is present and `(operation === 'create' || originalDoc?.feed !== 'main')` and `!canManageSubmittedLinks(req.user)`, throw `MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE`.
         - For `effectiveFeed === 'subfeed'`, when `!canSubmitToSubfeed(subfeed, authorId)`, throw `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE`.
         - On `operation === 'create'`, replace the `if (hasEditorialRole) ... else { nextData.status = isSubfeedPost ? 'published' : 'pending' }` block with: if `nextData.status !== 'removed' && nextData.quarantined !== true && req?.context?.forcePending !== true`, set `nextData.status = 'published'`; else if `req?.context?.forcePending === true`, set `nextData.status = 'pending'`.
  - **Proving Command**: `pnpm run typecheck`

- **Step 23.3 `[impl]` — Update `submitLink` and `submitPost` server actions to enforce policy and return `SubmissionOutcome`**
  - **Goal**: Align `src/app/actions/links.ts` and `src/app/actions/posts.ts` with collection enforcement and return `SubmissionOutcome`.
  - **Files**: `src/app/actions/links.ts`, `src/app/actions/posts.ts`
  - **Exact Change Intent**:
    1. In `src/app/actions/links.ts` (`submitLink`):
       - Widen `values.feed?: 'user' | 'subfeed' | 'main'` (defaulting to `'user'`).
       - If `feed === 'main'` and `!canManageSubmittedLinks(user)`, throw `new Error(MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE)`.
       - If `feed === 'subfeed'`, load `subfeed` with `...withAccess` and if `!canModerateCommunity(user) && !canSubmitToSubfeed(subfeed, userId)`, throw `new Error(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)`.
       - Create the link with `payload.create({ collection: 'links', data: { ...linkData, feed, _status: 'published', featured: false }, draft: false, ...withAccess })`.
       - Revalidate `'/'`, `'/submitted'`, `'/subfeeds'`, `/user/${encodeURIComponent(user.username)}`, and `/subfeeds/${subfeedSlug}` (when applicable).
       - Return `SubmissionOutcome` built from `createdLink` and `derivePersistedPublicationState('link', createdLink)`.
    2. In `src/app/actions/posts.ts` (`submitPost`):
       - Widen `values.feed?: 'user' | 'subfeed' | 'main'` (defaulting to `'user'`).
       - If `feed === 'main'` and `!canManageSubmittedLinks(user)`, throw `new Error(MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE)`.
       - If `feed === 'subfeed'`, load `subfeed` with `...withAccess` and if `!canModerateCommunity(user) && !canSubmitToSubfeed(subfeed, userId)`, throw `new Error(SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE)`.
       - Create the post with `payload.create({ collection: 'posts', data: { ..., feed, subfeed: subfeedId, type: 'discussion' }, ...withAccess })` (note: do not pass `status: 'published'` from non-moderator user data since `canEditStatus` is moderator-only; `preparePost` sets `status = 'published'`).
       - Revalidate `'/wall'`, `'/subfeeds'`, `/user/${encodeURIComponent(user.username)}`, and `/subfeeds/${subfeedSlug}` (when applicable).
       - Return `SubmissionOutcome` built from `createdPost` and `derivePersistedPublicationState('post', createdPost)`.
  - **Proving Command**: `pnpm run typecheck`

- **Step 23.4 `[test]` — Update and expand integration tests for personal-first publishing, membership-only denial, and local/editorial roles**
  - **Goal**: Prove all #23 acceptance criteria in `subfeed-eligibility.int.spec.ts`, `subfeed-targeting.int.spec.ts`, and `subfeed-roles.int.spec.ts`.
  - **Files**: `tests/vitest/int/subfeed-eligibility.int.spec.ts`, `tests/vitest/int/subfeed-targeting.int.spec.ts`, `tests/vitest/int/subfeed-roles.int.spec.ts`
  - **Exact Change Intent**:
    1. In `tests/vitest/int/subfeed-eligibility.int.spec.ts`:
       - Expand `'still lets an ineligible member publish to their User Feed'` to cover **both** `links` and `posts` created by an ordinary newcomer with `user, overrideAccess: false`.
       - Assert that both items persist `feed === 'user'`, `link._status === 'published'`, `post.status === 'published'`, and are **publicly readable** via `payload.find({ collection, where: { id: { equals: item.id } }, overrideAccess: false })` (anonymous reader, no `user`) as well as by another regular member (`user: otherReader, overrideAccess: false`).
       - Add tests proving an ordinary member cannot create a link or post with `feed: 'main'`, cannot create a link or post with `user: otherUser.id`, and cannot update their own User Feed link or post to `feed: 'main'`, `feed: 'subfeed'`, or `user: otherUser.id`.
    2. In `tests/vitest/int/subfeed-targeting.int.spec.ts`:
       - Update lines 174-217 expected error substring to `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE`.
       - Add tests proving that a user who has **joined** a SubFeed (`members: [owner.id, joinedMember.id]`, no local role) is **rejected** when creating a link or post in that SubFeed (with `user: joinedMember, overrideAccess: false`).
       - Add tests proving that a local `uploader`, `editor`, `moderator`, or `owner` **can** publish both a link and a post to that SubFeed, and they are publicly readable, while that same local publisher is **rejected** when targeting an unrelated SubFeed or `feed: 'main'`.
    3. In `tests/vitest/int/subfeed-roles.int.spec.ts`:
       - Update pure test at line 203 (`'allows local publishing roles to submit, but not plain members or outsiders'`): assert `canSubmitToSubfeed(subfeed, 5)` is `false` for plain member `5`, while `true` for owner `1`, editor `3`, uploader `4`.
       - In integration tests where a fixture `author` creates a SubFeed link/post to test curation/moderation by others (lines 353, 418, 428, 505, 553, 591, 619), include `uploaders: [author.id]` in `createTestSubfeed` for the fixture author (except in `'rejects moving %s to a subfeed where its author has no publishing role'` where `destination` omits `author` from `uploaders` and asserts `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE`).
       - Add pure unit tests for `getPublishingDestinationEligibility` and `derivePersistedPublicationState`.
  - **Proving Command**:
    ```bash
    pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts tests/vitest/int/subfeed-targeting.int.spec.ts tests/vitest/int/subfeed-roles.int.spec.ts
    ```

#### C.23.6 Safeguards

- **Local API + user (`AGENTS.md` Security Rule #1)**: Every `payload.find/findByID/create/update/delete` passed a `user` in actions, helpers, or tests MUST pass `overrideAccess: false`.
- **Hook atomicity (`AGENTS.md` Security Rule #2)**: Every nested `req.payload.*` call inside `prepareLink`, `preparePost`, and `enforceSubfeedContentTargetAccess` MUST pass `req`.
- **Hook loops (`AGENTS.md` Security Rule #3)**: Preserve `if (req?.context?.skipHooks) return data` at the top of `prepareLink`, `preparePost`, and `enforceSubfeedContentTargetAccess`.
- **Hook-level subfeed authorisation (`AGENTS.md`)**: Enforce SubFeed local publishing role in collection `beforeValidate` hooks (`prepareLink`, `preparePost`, `enforceSubfeedContentTargetAccess`), not only in UI or server actions.
- **Explicit draft/published targets (`AGENTS.md`)**: Pass explicit `_status: 'published'` and `draft: false` when publishing links; never infer status from `findByID` without `draft: true`.
- **Field-level access booleans (`AGENTS.md` Security Rule #4)**: Do not change `canEditStatus` or `canEditModeration` to return query objects; they must remain boolean-returning `FieldAccess` functions.

#### C.23.7 Verification Commands

```bash
pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts tests/vitest/int/subfeed-targeting.int.spec.ts tests/vitest/int/subfeed-roles.int.spec.ts tests/vitest/int/editorial-priority-and-safety.int.spec.ts tests/vitest/int/main-feed-promotion.int.spec.ts
pnpm run typecheck
pnpm run lint
```

#### C.23.8 Definition of Done & Stop-and-Ask Triggers

- **Definition of Done**:
  - All five integration test files in C.23.7 pass with 0 failures.
  - `pnpm run typecheck` and `pnpm run lint` exit 0.
  - `git diff` touches only `src/lib/community/subfeeds.ts`, `src/collections/Links/index.ts`, `src/collections/Posts/index.ts`, `src/app/actions/links.ts`, `src/app/actions/posts.ts`, and the three test files in `tests/vitest/int/`.
- **Stop-and-Ask Triggers**:
  - Any existing test in `editorial-priority-and-safety.int.spec.ts` or `main-feed-promotion.int.spec.ts` fails due to hook changes.
  - Any schema change appears needed (none should be needed).

#### C.23.9 Self-Contained Handoff Prompt for Issue #23

````markdown
You are the implementation agent (`opencode-go/deepseek-v4.1-flash`) in `/Users/royal/www/v4`.
Your task is to implement **Issue #23: Enforce personal-first publishing and consistent destination eligibility**.

### Required Reading First

1. `AGENTS.md`
2. `.agents/skills/payload/SKILL.md`, `.agents/skills/payload/reference/HOOKS.md`, `.agents/skills/payload/reference/ACCESS-CONTROL.md`
3. `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md` and `09-revalidating.md`
4. `.agents/implementations/PLAN_PERSONAL_FEED_PUBLISHING.md` Section C (Issue #23)

### Locked Decisions & Exact Changes

1. **`src/lib/community/subfeeds.ts`**:
   - Change `canSubmitToSubfeed(subfeed, userId)` (line 82) to return `roles.uploader || roles.editor || roles.moderator || roles.owner` (remove `roles.member`).
   - Export constants:
     - `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE = 'You need a local publishing role (uploader, editor, moderator, or owner) to publish to this SubFeed.'`
     - `MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE = 'Only site editors, uploaders, moderators, and administrators can publish directly to the Main Feed.'`
     - `FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE = 'You can only publish to your own User Feed.'`
   - Export types `PublishingFeedKind`, `EligibleSubfeedOption`, `PublishingDestinationEligibility`, `PublicationVisibilityState`, `SubmissionOutcome` and functions `getPublishingDestinationEligibility`, `loadPublishingDestinationEligibility`, and `derivePersistedPublicationState` exactly as specified in Plan Section C.23.4 & C.23.5 Step 23.1.
   - Update `enforceSubfeedContentTargetAccess` so an author updating their own doc cannot change `user` to another user, cannot change `feed` to `'main'` unless `canManageSubmittedLinks(req.user)`, and cannot change `feed`/`subfeed` to a SubFeed unless `canModerateCommunity(req.user) || canSubmitToSubfeed(targetSubfeed, req.user.id)`.
2. **`src/collections/Links/index.ts` & `src/collections/Posts/index.ts`**:
   - Change `Links` `feed` field `defaultValue` from `'main'` to `'user'`.
   - In `prepareLink` and `preparePost`:
     - Default `nextData.feed = 'user'` on `create` when undefined.
     - When `req.user` is present and `!canModerateCommunity(req.user)`: on `create`, reject `nextData.user` if `resolveID(nextData.user) !== resolveID(req.user.id)` with `FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE` and set `nextData.user = req.user.id`.
     - When `effectiveFeed === 'main'` and `req.user` is present and `(operation === 'create' || originalDoc?.feed !== 'main')` and `!canManageSubmittedLinks(req.user)`, throw `MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE`.
     - When `effectiveFeed === 'subfeed'` and `!canSubmitToSubfeed(subfeed, authorId)`, throw `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE`.
     - On `create`: in `prepareLink`, set `nextData._status = 'published'` when `nextData._status === undefined && !req?.query?.draft && req?.context?.forcePending !== true`. In `preparePost`, set `nextData.status = 'published'` when `nextData.status !== 'removed' && nextData.quarantined !== true && req?.context?.forcePending !== true` (and `'pending'` if `req?.context?.forcePending === true`).
3. **`src/app/actions/links.ts` & `src/app/actions/posts.ts`**:
   - Accept `feed?: 'user' | 'subfeed' | 'main'` (default `'user'`) in `submitLink` and `submitPost`.
   - Validate destination with `MAIN_FEED_PUBLISH_UNAUTHORIZED_MESSAGE` and `SUBFEED_PUBLISH_UNAUTHORIZED_MESSAGE`.
   - Return `SubmissionOutcome` built from the persisted doc and `derivePersistedPublicationState`.
4. **Tests (`tests/vitest/int/subfeed-{eligibility,targeting,roles}.int.spec.ts`)**:
   - Update and add the test cases specified in Plan Step 23.4.

### Verification

Run and report verbatim output:

```bash
pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts tests/vitest/int/subfeed-targeting.int.spec.ts tests/vitest/int/subfeed-roles.int.spec.ts tests/vitest/int/editorial-priority-and-safety.int.spec.ts tests/vitest/int/main-feed-promotion.int.spec.ts
pnpm run typecheck
pnpm run lint
```
````

Do not touch any other files or run git write commands.

````

---

### Issue #27: Refactor seed into readable curated scenarios for a fresh test database

#### C.27.1 Objective
Replace the bulk random/Faker seed pipeline with a compact, deterministic, human-readable fictional community for a fresh isolated test database. Every persona, SubFeed, link, post, comment thread, vote, bookmark, discovery, and report has a stable semantic key, coherent topical copy (no Lorem ipsum, no numeric suffixes), and intentional author/destination relationships that obey #23's personal-first and SubFeed-role publishing rules. Running `pnpm run seed` a second time reconciles existing seed-owned records idempotently without duplicating interactions or wiping unrelated user data.

#### C.27.2 Acceptance Criteria Checklist
- [ ] Keep `pnpm run seed` as the documented entry point. On a fresh, migrated, explicitly isolated local/test database it creates a complete usable community without needing pre-existing users/content.
- [ ] Default to a small curated fixture set with stable semantic identifiers and coherent fictional identities. Use reserved example domains (`.example`, `example.com`, `example.org`) for fictional contact details; do not introduce real personal data or committed secrets.
- [ ] Usernames, bios, Subfeed names/descriptions, link/post titles and bodies, and comments/replies are readable and internally consistent. No Lorem ipsum, random numeric title suffixes, or repeated generic templates in the default human-visible dataset. Use relevant conversations and intentional author/content relationships.
- [ ] Include recognisable scenarios: a newcomer with no joined Subfeeds, a membership-only participant, authorised local publisher(s), a site-wide editorial publisher and an administrator for existing safety workflows. Document which fixture demonstrates which behavior; reuse personas where appropriate instead of inflating volume.
- [ ] Include links and posts in personal User Feeds, authorised local Subfeed content and authorised Main Feed editorial content. Include clearly identifiable promoted versus unpromoted personal/Subfeed examples using the existing promotion policy, without changing content origin or production thresholds.
- [ ] Ordinary authors publish only to their own User Feed. Membership-only participants do not publish into Subfeeds. Verify final effective roles/standing after hooks, not merely the requested role fields. Do not bypass #23's enforcement to make fixtures fit.
- [ ] Votes, comments, bookmarks, discoveries and reports reference deliberate seeded records and match the scenario narratives. Preserve vote uniqueness and correct reply targets. Keep safety/moderation examples small and truthful; use existing supported setup rather than weakening checks or inventing production test switches.
- [ ] Scenario identity, associations and expected visibility are reproducible. Make time-sensitive fixtures use one documented reference time per run so recency/editorial priority are intentional; do not confuse reproducible scenarios with identical database-generated IDs or timestamps.
- [ ] A second seed run does not append another random community, duplicate votes/comments/reports or overwrite unrelated user-created data. Use stable scenario keys and explicit handling of existing seed-owned records. If existing seed-owned data conflicts with required invariants, reconcile it deliberately or fail with actionable diagnostics, never silently skip required scenarios.
- [ ] Missing prerequisites, invalid relationships or failed scenario creation produce explicit errors/non-zero exit rather than a misleading successful partial seed. Provide a concise scenario/count summary on success.
- [ ] The default seed does not require scraping, AI text generation or live metadata fetching. Use authored fixture metadata and existing/local assets where needed; external links may be illustrative but seeding must not depend on them responding.
- [ ] Document safe fresh-database preparation, the actual schema/migration commands supported by the repo, seed invocation, scenario names, reference-time behavior and repeat-run expectations. Do not add an automatic database wipe or run against an existing/shared/production database. Use the existing credential setup without committing secrets.
- [ ] Verify on a fresh isolated database and rerun there. Assert expected scenario identities, relationship integrity, public readability versus owner-only states, and effective publishing privileges; inspect the Home/personal/Subfeed experience against the manifest. Record actual commands and results.

#### C.27.3 Findings from Current Code
- **`src/scripts/seed/seed.ts:1-35`**: Sequentially calls `seedUsers`, `seedSubfeeds`, `seedLinks`, `seedPosts`, `seedComments`, `seedVotes`, `seedBookmarks`, `seedDiscoveries`, `seedReports`. Does not pass a shared `referenceNow: Date` or scenario registry between steps.
- **`src/scripts/seed/seeders/utils.seed.ts:1-62`**: Exports `pickOne`, `chance`, `randomInt`, `asLexicalRichText`, `randomRecentDateISO`, `slugify` using `Math.random` and `@faker-js/faker`.
- **`src/scripts/seed/seeders/users.seed.ts:1-127`**: Creates 3 core users (`admin@mail.com`, `moderator@mail.com`, `editor@mail.com`) and 14 random Faker users. Note that `Users` collection `syncCommunityProfile` (`src/collections/Users/index.ts:29-136`) automatically derives `roles` from signal scores on every create/update (`admin` is preserved, but `moderator`, `editor`, `uploader`, `cleaner`, `recruiter` are derived from `discoveryScore`, `contributionScore`, `interactionScore`, `cleaningScore`, `recruiterScore`, `securityScore`, `lastActiveAt`!). Setting `roles: ['editor', 'user']` without qualifying signals causes `syncCommunityProfile` to strip `'editor'` if signals don't meet `canEditPromote`!
  - Let's check `users.seed.ts:42-65`: currently `moderator@mail.com` sets `moderationScore: 150, securityScore: 80` (which maps `cleaningPoints = 150 >= 80` -> `moderator` role!), and `editor@mail.com` sets `contributionScore: 240, interactionScore: 130, discoveryScore: 90` (weighted TMV >= 288 `trusted`, `contribution >= 180`, `interaction >= 60` -> `editor` + `uploader` + `recruiter`!).
- **`src/scripts/seed/seeders/subfeeds.seed.ts:1-104`**: Uses `chance(0.35)` to pick random members and sets `moderators: [moderator.id]`, `editors: []`, `uploaders: []`.
- **`src/scripts/seed/seeders/links.seed.ts:128-255` & `posts.seed.ts:87-185`**:
  - `pickEligibleSubfeed` checks `members.includes(authorId) || moderators.includes(authorId)` — this directly violates #23!
  - Generates 45–50 random items with numeric suffixes (`faker.number.int({ min: 100, max: 9999 })`) and random `overrideAccess: true` writes where ordinary users are assigned `feed: 'main'` or `feed: 'subfeed'`.
- **`src/scripts/seed/seeders/comments.seed.ts:1-97`**: Generates 120 `faker.lorem.sentences` comments with no idempotency check on rerun! Rerunning `pnpm run seed` appends another 120 random comments every time!
- **`src/scripts/seed/seeders/bookmarks.seed.ts:1-93` & `discoveries.seed.ts:1-63` & `reports.seed.ts:1-138`**: Do not preload existing DB rows into their seen-sets! Rerunning `pnpm run seed` duplicates bookmarks, discoveries, and reports on every run!
- **Note on Votes hook (`src/collections/Votes/hooks/recalculateVotes.ts`)**: When votes, comments, or discoveries are created, `recalculateTargetSignals` (`src/lib/community/contentSignals.ts:22-167`) recalculates `upvotes`, `downvotes`, `score`, `commentsCount`, `uniqueCommenters`, `trustedInteractions`, `discoveryMomentum`, `rankingScore`, `featured`, `breaking`, `controversial` from actual `votes`, `comments`, and `discoveries` rows! Therefore, in the seed pipeline, either:
  1. Seed `votes`, `comments`, and `discoveries` first (or let them trigger `recalculateTargetSignals`), AND/OR
  2. Set the final deterministic signal/promotion fields on `links` and `posts` (such as `clickCount`, `featured`, `quarantined`, or `upvotes`/`rankingScore` for promoted fixtures) **after** or in coordination with `votes`/`comments`/`discoveries` so `recalculateTargetSignals` does not overwrite promoted fixture thresholds with `upvotes: 1`!
  - Let's verify this! In `src/collections/Votes/hooks/recalculateVotes.ts` and `src/collections/Comments/index.ts`, creating a vote or comment triggers `recalculateTargetSignals`, which counts actual `votes` rows for that target and overwrites `upvotes`, `downvotes`, `score`, `rankingScore`, and `featured: organicScore >= 120 && ranking.spamProbability < 0.55`!
  - That is a crucial finding from `src/lib/community/contentSignals.ts:144-164`! If a link/post was created with `upvotes: 50, featured: true`, and then 2 votes are created on it during `seedVotes`, `recalculateTargetSignals` overwrites `upvotes` to `2` and `featured` to `false`!

#### C.27.4 Locked Design Decisions (Do Not Re-open)

1. **Curated Persona Roster (8 Personas, `@example.com` emails, `password123`)**:
   - **Decision**: Define a single curated manifest in `src/scripts/seed/seeders/utils.seed.ts` (or `manifest.seed.ts` imported by the existing seeders) with 8 deterministic personas using `@example.com` emails (also preserving/aliasing `admin@mail.com` only if needed? Wait: `users.seed.ts` previously had `admin@mail.com`, while issue #27 AC 2 explicitly states: *"Default to a small curated fixture set with stable semantic identifiers and coherent fictional identities. Use reserved example domains for fictional contact details; do not introduce real personal data or committed secrets."* And `tests/playwright/e2e/global.setup.ts` / `tests/vitest/utils/test-user.ts` create their own `admin@mail.com` if missing). So all seeded personas in `users.seed.ts` use `@example.com`:
     1. **`astrid`** (`astrid@example.com`) — **Newcomer (No Joined SubFeeds)**: `discoveryScore: 0, contributionScore: 0, interactionScore: 0` → `trustLevel: 'newcomer'`, `roles: ['user']`, joined SubFeeds: `[]`. Publishes personal links and posts to her own User Feed (`feed: 'user'`).
     2. **`malin`** (`malin@example.com`) — **Membership-Only Participant**: `contributionScore: 20, interactionScore: 25` → `trustLevel: 'regular'`, `roles: ['user']`, member of `nordic-indie-web` and `craft-design-systems` (`members` only, no local publishing role). Publishes only to her own User Feed (`feed: 'user'`); cannot publish to joined SubFeeds.
     3. **`soren`** (`soren@example.com`) — **SubFeed Owner (`nordic-indie-web`) & Qualified Uploader**: `contributionScore: 200, discoveryScore: 70, interactionScore: 40` → `trustLevel: 'trusted'`, `roles: ['user', 'uploader', 'recruiter']`. Owns `nordic-indie-web`; has no local role in `craft-design-systems`.
     4. **`linnea`** (`linnea@example.com`) — **Local Uploader (`nordic-indie-web`) Only (No Site-Wide Publishing Role)**: `contributionScore: 30, interactionScore: 20` → `trustLevel: 'regular'`, `roles: ['user']`. Listed in `uploaders` and `members` of `nordic-indie-web`. Can publish to `nordic-indie-web` and her own User Feed, but **not** to `craft-design-systems`, `applied-ai-notes`, or `feed: 'main'`.
     5. **`henrik`** (`henrik@example.com`) — **SubFeed Owner (`craft-design-systems`) & Local Editor (`nordic-indie-web`)**: `contributionScore: 130, discoveryScore: 65, interactionScore: 50` → `trustLevel: 'recognized'`, `roles: ['user', 'uploader', 'recruiter']`. Owns `craft-design-systems` and is local `editor` in `nordic-indie-web`.
     6. **`freja`** (`freja@example.com`) — **Site-Wide Editorial Publisher (`editor`) & SubFeed Owner (`applied-ai-notes`)**: `contributionScore: 300, interactionScore: 110, discoveryScore: 95` → `trustLevel: 'veteran'`, `roles: ['user', 'uploader', 'editor', 'recruiter']`. Publishes directly to `feed: 'main'` (receiving active 24h `editorialPriority`).
     7. **`kalle`** (`kalle@example.com`) — **Site Moderator (`moderator`)**: `contributionScore: 160, interactionScore: 90, cleaningScore: 120, moderationScore: 120, securityScore: 60` → `trustLevel: 'trusted'`, `roles: ['user', 'uploader', 'moderator', 'cleaner', 'recruiter']`. Reviews moderation reports.
     8. **`alva`** (`alva@example.com`) — **Site Administrator (`admin`)**: `roles: ['admin', 'user']`, `contributionScore: 320, discoveryScore: 220, interactionScore: 240, cleaningScore: 180, moderationScore: 180, securityScore: 120`.
   - **Rationale**: Covers every persona required by #27 AC 4 with realistic Nordic/tech community identities and deterministic standing signals that survive `syncCommunityProfile` hook derivation.

2. **Curated SubFeeds (3 SubFeeds) & Content Scenarios (12 Links + 10 Posts)**:
   - **Decision**:
     - **3 SubFeeds**:
       1. `nordic-indie-web` ("Nordic Indie Web") — owner `soren`, moderators `[soren]`, editors `[henrik]`, uploaders `[linnea]`, members `[soren, henrik, linnea, malin]`, `featured: true`.
       2. `craft-design-systems` ("Craft & Design Systems") — owner `henrik`, moderators `[henrik]`, editors `[]`, uploaders `[]`, members `[henrik, malin, freja]`, `featured: true`.
       3. `applied-ai-notes` ("Applied AI Notes") — owner `freja`, moderators `[freja]`, editors `[]`, uploaders `[soren]`, members `[freja, soren]`, `featured: false`.
     - **Content Scenarios (12 Links, 10 Posts)** — each with a stable `slug`, authored title/body/url on `.example` domains (e.g., `https://indieweb.example/small-tools-2026`), and explicit scenario role:
       - **Newcomer User Feed (`astrid`, `feed: 'user'`)**:
         1. Unpromoted personal link (`astrid-personal-rss-setup`, stays solely on Astrid's User Feed).
         2. Promoted personal link (`astrid-sqlite-backup-notes`, organic promotion via votes/clicks + `featured: true` into Main Feed, preserving `feed: 'user'` origin badge `"From astrid's User Feed"`).
         3. Unpromoted personal post (`astrid-first-week-shipping-notes`, `feed: 'user'`, `status: 'published'`).
         4. Promoted personal post (`astrid-self-hosted-analytics-tradeoffs`, `feed: 'user'`, `status: 'published'`, `featured: true`).
       - **Membership-Only User Feed (`malin`, `feed: 'user'`)**:
         5. Personal link (`malin-accessibility-audit-checklist`, `feed: 'user'`).
         6. Personal post (`malin-why-contrast-tokens-drift`, `feed: 'user'`, `status: 'published'`).
         *(Zero SubFeed items by `malin` — she is only a `member` of `nordic-indie-web` and `craft-design-systems`.)*
       - **Authorised Local SubFeed Publishing (`linnea`, `soren`, `henrik`, `feed: 'subfeed'`)**:
         7. `linnea` link in `nordic-indie-web` (`linnea-static-feed-reader-benchmarks`, unpromoted local SubFeed link).
         8. `linnea` post in `nordic-indie-web` (`linnea-lessons-from-building-a-webring`, promoted local SubFeed post).
         9. `soren` link in `nordic-indie-web` (`soren-minimal-postgres-queue-patterns`, promoted to Main Feed, preserving `nordic-indie-web` origin badge).
         10. `soren` post in `applied-ai-notes` (`soren-local-embedding-latency-notes`, local SubFeed post via `uploaders` role).
         11. `henrik` link in `craft-design-systems` (`henrik-subgrid-card-rhythm-guide`, promoted to Main Feed).
         12. `henrik` post in `craft-design-systems` (`henrik-focus-ring-ergonomics`, unpromoted local SubFeed post).
       - **Site-Wide Editorial Main Feed (`freja`, `alva`, `feed: 'main'`)**:
         13. `freja` link in `main` (`freja-v4-spring-architecture-digest`, active `editorialPriority: true`, `editorialPriorityUntil: referenceNow + 24h`).
         14. `freja` post in `main` (`freja-editorial-roadmap-personal-feeds`, active `editorialPriority: true`).
         15. `alva` link in `main` (`alva-archive-protocol-retrospective`, expired editorial priority: `editorialPriority: true`, `editorialPriorityUntil: referenceNow - 6h`).
       - **Safety & Moderation Examples (supported states)**:
         16. Pending post on `malin`'s User Feed (`malin-draft-vendor-comparison-pending`, created with `context: { forcePending: true }` → `status: 'pending'`, visible to `malin` and moderators, hidden from anonymous/other readers).
         17. Quarantined link (`soren-disputed-benchmark-mirror`, `feed: 'user'`, `quarantined: true` set by `alva`, excluded from public reads and Main Feed).
         18. Controversial link (`henrik-tabs-vs-spaces-css-reset`, `feed: 'subfeed'`, `featured: true` but balanced upvotes/downvotes → `controversial: true`, excluded from Main Feed promotion).
   - **Rationale**: Every single acceptance criterion in #27 and #26 is represented by a named, inspectable record with zero random noise.

3. **Normal User Authorization (`user` + `overrideAccess: false`) vs Trusted Bootstrap**:
   - **Decision**:
     - Bootstrap `users` and `subfeeds` with `overrideAccess: true`, then re-read each seeded `User` document and assert their post-hook derived `roles` and `trustLevel` match expectations (failing loudly if any invariant is violated).
     - Create all user-authored `links`, `posts`, `comments`, `votes`, `bookmarks`, and `reports` using `user: authorDoc, overrideAccess: false` so #23's collection hooks and access controls are exercised for real!
     - Use `overrideAccess: true` after creation **only** in an explicit post-interaction reconciliation pass (`applyScenarioSignalOverrides`) to set moderator/system fields (`featured`, `quarantined`, `editorialPriorityUntil`, `clickCount`, and exact promotion signal floors after `recalculateTargetSignals` has run).
   - **Rationale**: Proves that the seeded community actually obeys #23's authorization rules rather than bypassing them with `overrideAccess: true`.

4. **Single Reference Time (`referenceNow`) & Idempotent Rerun Reconciliation**:
   - **Decision**:
     - `seed.ts` creates `const referenceNow = new Date(process.env.SEED_REFERENCE_TIME ?? Date.now())` once per run and threads it into all seeders.
     - Every seeded record has a stable natural key:
       - `users`: `email` / `username`
       - `subfeeds`: `slug`
       - `links`: `slug` (and `url`)
       - `posts`: `slug`
       - `comments`: `(targetType, targetId, userId, commentText)`
       - `votes`: `(userId, targetType, targetId)`
       - `bookmarks`: `(userId, targetType, targetId)`
       - `discoveries`: `(userId, postId)`
       - `reports`: `(reporterId, targetType, targetId, reason)`
     - On rerun: each seeder looks up existing records by their natural key. If a seed-owned record exists, it updates/reconciles it in place (preserving unrelated user-created rows) and skips creating duplicate `comments`, `votes`, `bookmarks`, `discoveries`, or `reports`. If a conflicting record violates a scenario invariant (e.g. username collision with a non-seed email), the seeder throws an actionable error and `seed.ts` exits non-zero (`process.exit(1)`).
   - **Rationale**: Guarantees that running `pnpm run seed` twice produces 0 duplicate rows across all 9 collections while leaving user-created data intact.

#### C.27.5 Ordered Steps (`[impl]` / `[test]`)

- **Step 27.1 `[impl]` — Define the deterministic scenario manifest and shared helpers in `src/scripts/seed/seeders/utils.seed.ts`**
  - **Goal**: Replace random Faker/Math.random helpers in `utils.seed.ts` with deterministic helpers (`asLexicalRichText`, `slugify`, `offsetIsoFromReference(referenceNow, hoursOffset)`) and export the typed scenario manifest (personas, subfeeds, links, posts, comments, votes, bookmarks, discoveries, reports) plus a post-hook invariant verifier.
  - **Files**: `src/scripts/seed/seeders/utils.seed.ts`
  - **Exact Change Intent**: Author the 8 personas, 3 SubFeeds, 9 links + 9 posts (or 12 links + 10 posts as listed in C.27.4), coherent topical comment threads (including parent/child replies on the same target), deterministic votes (matching promoted vs unpromoted vs controversial targets), bookmarks, discoveries, and reports. Export `SEED_SCENARIO_MANIFEST` so tests and logs can inspect scenario keys.
  - **Proving Command**: `pnpm run typecheck`

- **Step 27.2 `[impl]` — Refactor `users.seed.ts` and `subfeeds.seed.ts` for idempotent upsert and post-hook verification**
  - **Goal**: Upsert the 8 personas and 3 SubFeeds deterministically and assert effective roles/standing after hooks.
  - **Files**: `src/scripts/seed/seeders/users.seed.ts`, `src/scripts/seed/seeders/subfeeds.seed.ts`
  - **Exact Change Intent**:
    1. In `users.seed.ts`: Upsert each persona by `email`/`username` using `referenceNow.toISOString()` for `lastActiveAt`. After upsert, verify `astrid` has `roles: ['user']` and `trustLevel: 'newcomer'`, `malin` has `roles: ['user']`, `linnea` has `roles: ['user']`, `soren` has `'uploader'`, `freja` has `'editor'`, `kalle` has `'moderator'`, and `alva` has `'admin'`. Throw an explicit error if any derived role mismatches. Return a `Map<PersonaKey, User>`.
    2. In `subfeeds.seed.ts`: Upsert the 3 SubFeeds by `slug`, wiring `owner`, `moderators`, `editors`, `uploaders`, and `members` from the resolved user map. Verify `astrid` is in 0 SubFeeds, `malin` is only in `members` (never `uploaders`/`editors`/`moderators`/`owner`), and `linnea` is in `uploaders` of `nordic-indie-web` only. Return a `Map<SubfeedKey, Subfeed>`.
  - **Proving Command**: `pnpm run typecheck`

- **Step 27.3 `[impl]` — Refactor `links.seed.ts`, `posts.seed.ts`, `comments.seed.ts`, `votes.seed.ts`, `bookmarks.seed.ts`, `discoveries.seed.ts`, `reports.seed.ts`, and `seed.ts`**
  - **Goal**: Create/reconcile all content and interactions using `user` + `overrideAccess: false` where appropriate, prevent rerun duplication across all 9 collections, apply post-interaction signal reconciliation, and print a scenario manifest summary.
  - **Files**: `src/scripts/seed/seeders/links.seed.ts`, `src/scripts/seed/seeders/posts.seed.ts`, `src/scripts/seed/seeders/comments.seed.ts`, `src/scripts/seed/seeders/votes.seed.ts`, `src/scripts/seed/seeders/bookmarks.seed.ts`, `src/scripts/seed/seeders/discoveries.seed.ts`, `src/scripts/seed/seeders/reports.seed.ts`, `src/scripts/seed/seed.ts`
  - **Exact Change Intent**:
    1. `links.seed.ts` & `posts.seed.ts`: Upsert by `slug` (and `url` for links). On create, pass `user: authorDoc, overrideAccess: false` (and `context: { forcePending: true }` for `malin`'s pending post fixture) so #23's collection hooks enforce destination eligibility.
    2. `comments.seed.ts`: Preload existing comments for seeded targets; match by `(targetKey, authorId, text)` so reruns create 0 duplicates. Resolve `parentComment` by scenario comment key on the same target.
    3. `votes.seed.ts`, `bookmarks.seed.ts`, `discoveries.seed.ts`, `reports.seed.ts`: Preload existing rows into a seen-map by natural key; create missing rows and reconcile changed values.
    4. In `seed.ts`: After `seedVotes`, `seedComments`, and `seedDiscoveries` finish (which trigger `recalculateTargetSignals`), run a deterministic `reconcileSeededContentSignals(payload, referenceNow)` step that applies each fixture's intended `clickCount`, `upvotes`, `downvotes`, `featured`, `quarantined`, and `editorialPriorityUntil` (so promoted fixtures satisfy `isEligibleForMainFeedPromotion(doc) === true`, unpromoted fixtures satisfy `isEligibleForMainFeedPromotion(doc) === false`, and the controversial fixture has `controversial === true`), and verifies every scenario invariant before printing a concise table of created/reconciled counts and exiting 0.
  - **Proving Command**: `pnpm run typecheck && pnpm run lint`

- **Step 27.4 `[test]` — Add integration test coverage for seed scenario invariants & rerun idempotency and document fresh-DB workflow**
  - **Goal**: Verify curated seed scenarios, authorization compliance, and idempotent second run in Vitest, and document the fresh-DB preparation and manifest in `.agents/implementations/IMPLEMENT_PERSONAL_FEED_PUBLISHING.md` (or a dedicated section in `docs/seed-scenarios.md` if `.agents/implementations/IMPLEMENT_PERSONAL_FEED_PUBLISHING.md` is read-only during planning — note: during implementation of #27, issue #27 AC 12 & validation explicitly ask to document fresh-database preparation and scenario manifest).
  - **Files**: `tests/vitest/int/subfeed-targeting.int.spec.ts` (or a focused `describe('Curated seed pipeline (#27)')` block inside `tests/vitest/int/subfeed-eligibility.int.spec.ts`), `README.md`
  - **Exact Change Intent**:
    1. Add a focused integration test that runs the exported seed functions twice against the test Payload instance, asserting:
       - All 8 personas exist with expected post-hook `roles` and `trustLevel`.
       - `astrid` has 0 joined SubFeeds and publicly readable User Feed link & post.
       - `malin` is a member of `nordic-indie-web` but `canSubmitToSubfeed` is `false` and she has 0 SubFeed items.
       - `linnea` can publish to `nordic-indie-web` (`canSubmitToSubfeed === true`) but not `craft-design-systems` or `main`.
       - Promoted personal (`astrid`) and SubFeed (`soren`, `henrik`) items match `buildMainFeedWhere()`, while unpromoted, pending (`malin`), quarantined (`soren`), and controversial (`henrik`) items do not.
       - Running the seed pipeline a second time creates 0 additional users, subfeeds, links, posts, comments, votes, bookmarks, discoveries, or reports, and does not delete pre-existing non-seed test records.
    2. Document safe fresh-database preparation (`createdb`, `pnpm payload migrate`, `DATABASE_URL` isolation check, `SEED_REFERENCE_TIME`, `pnpm run seed`, rerun expectations, and the scenario manifest table) in `README.md`.
  - **Proving Command**:
    ```bash
    pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts
    ```

#### C.27.6 Safeguards
- **Never wipe or reset an existing/shared/production database**: Do not add `DROP TABLE`, `TRUNCATE`, or `payload.delete({ where: {} })` to `seed.ts`.
- **Local API + user (`overrideAccess: false`)**: Use `user: authorDoc, overrideAccess: false` when creating user-authored links/posts in the seed so #23's hook enforcement is genuinely exercised.
- **No live network / AI calls**: Do not call `/api/check-embed`, `/api/scrape-media`, OpenAI, or Gemini during seeding.
- **Reserved example domains**: All seeded user emails must use `@example.com` and illustrative external URLs must use `.example` / `example.com` / `example.org`.

#### C.27.7 Verification Commands
```bash
pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts
pnpm run typecheck
pnpm run lint
````

_(At **Checkpoint 2**, once the human confirms an isolated fresh test database in `DATABASE_URL`, run `pnpm run seed` twice and record both outputs.)_

#### C.27.8 Definition of Done & Stop-and-Ask Triggers

- **Definition of Done**:
  - Zero `@faker-js/faker` or `Math.random()` calls remain in `src/scripts/seed/`.
  - Second seed execution in the integration test creates 0 duplicate records across all 9 collections.
  - All scenario invariants (post-hook roles, personal vs SubFeed vs Main Feed origins, promoted vs unpromoted vs quarantined/controversial/pending states) are verified automatically.
  - `pnpm run typecheck` and `pnpm run lint` exit 0.
- **Stop-and-Ask Triggers**:
  - **Before running `pnpm run seed` via CLI**: Stop at **Checkpoint 2** and ask the human to confirm that `DATABASE_URL` points to an isolated test database rather than a shared or production database.

#### C.27.9 Self-Contained Handoff Prompt for Issue #27

````markdown
You are the implementation agent (`opencode-go/deepseek-v4.1-flash`) in `/Users/royal/www/v4`.
Your task is to implement **Issue #27: Refactor seed into readable curated scenarios for a fresh test database**.

### Required Reading First

1. `AGENTS.md`
2. `.agents/skills/payload/SKILL.md`
3. `.agents/implementations/PLAN_PERSONAL_FEED_PUBLISHING.md` Section C (Issue #27)

### Locked Decisions & Exact Changes

1. Remove all `@faker-js/faker` and `Math.random()` usage from `src/scripts/seed/seeders/*`.
2. In `src/scripts/seed/seeders/utils.seed.ts`, define `SEED_SCENARIO_MANIFEST` with the 8 personas (`astrid`, `malin`, `soren`, `linnea`, `henrik`, `freja`, `kalle`, `alva` — all `@example.com`), 3 SubFeeds (`nordic-indie-web`, `craft-design-systems`, `applied-ai-notes`), and the curated links, posts, coherent topical comments (with parent/child replies on the same target), votes, bookmarks, discoveries, and reports specified in Plan Section C.27.4.
3. Refactor `users.seed.ts`, `subfeeds.seed.ts`, `links.seed.ts`, `posts.seed.ts`, `comments.seed.ts`, `votes.seed.ts`, `bookmarks.seed.ts`, `discoveries.seed.ts`, `reports.seed.ts`, and `seed.ts` to accept a single `referenceNow: Date` per run, upsert by natural key without touching unrelated user data, create user-authored content with `user: authorDoc, overrideAccess: false`, reconcile promotion/safety signals after vote/comment hooks run, verify post-hook roles/visibility, and fail with non-zero exit if any invariant fails.
4. Add the seed/rerun integration test in `tests/vitest/int/subfeed-eligibility.int.spec.ts` and document fresh-DB setup and the scenario manifest in `README.md`.
5. **CRITICAL**: Do NOT run `pnpm run seed` against the configured `.env` database until the human confirms the database target at Checkpoint 2. Run the Vitest integration test, `pnpm run typecheck`, and `pnpm run lint`.

### Verification

```bash
pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts
pnpm run typecheck
pnpm run lint
```
````

````

---

### Issue #24: Make Home and submission forms start with Add to your feed

#### C.24.1 Objective
Align the Home contribution card, standalone submission pages (`/new-link`, `/new-post`), and SubFeed submission panels with personal-first publishing. Every authenticated member — including newcomers with zero joined SubFeeds — gets a direct "Add to your feed" entry point on Home for both links and posts, with their own User Feed selected by default. Destination dropdowns appear only when the member has more than one authorized destination (`canPublishToMain` or at least one SubFeed with a local publishing role), and copy in both English and Swedish explains clearly that User Feed publications are public and can earn Main Feed reach without promising promotion.

#### C.24.2 Acceptance Criteria Checklist
- [ ] Home gives ordinary members a clear Add to your feed action for links and posts, including members with no joined SubFeeds. Creating/joining a SubFeed is not presented as a prerequisite to contributing.
- [ ] Both standalone and Home forms default ordinary members to their own User Feed, with no Main Feed or SubFeed publishing choice available to membership-only users.
- [ ] When only the User Feed is permitted, state that destination clearly instead of requiring a meaningless choice.
- [ ] Privileged publishers can still reach destinations they are authorised to use. Eligible SubFeed entry journeys retain that SubFeed context; ineligible users receive an explicit explanation and a personal-publishing path.
- [ ] Short copy explains that public personal content can earn Main Feed reach; do not promise promotion, immediate Main Feed placement or private visibility.
- [ ] Destination availability follows #23, including membership/role changes detected on submission. Do not copy a second eligibility implementation into the UI.
- [ ] Use existing English/Swedish dictionary patterns, reusable modal/form primitives and accessible labels/focus behavior. Preserve unrelated form fields and validation.
- [ ] Add focused coverage for newcomer destination presentation/defaults and the no-joined-SubFeeds Home path; preserve privileged publishing entry behavior.

#### C.24.3 Findings from Current Code
- **`src/app/(frontend)/page.tsx:781-790` & `810-819`**:
  - Computes `contributeVariant = !user ? 'guest' : joinedSubfeeds.length > 0 ? 'member' : 'noSubfeeds'`.
  - Passes `contributeSubfeeds = joinedSubfeeds.map(...)` (which includes SubFeeds where the user is only a `member`!).
- **`src/components/links/HomeContributeCard.client.tsx:46-56`, `138-148`, `177-202`, `295-327`**:
  - When `variant === 'noSubfeeds'` (lines 138-148, 177-188), it hides the link/post submission buttons entirely and renders `Browse SubFeeds` (`/subfeeds`) and `Start a new SubFeed` (`/subfeeds/new`)!
  - When `variant === 'member'`, the modals pass `defaultFeed="subfeed"` and `defaultSubfeedId={subfeedOptions[0]?.id}` to `LinkSubmitForm` (line 298) and `PostSubmitForm` (line 322).
- **`src/components/links/LinkSubmitForm.tsx:64-138` & `512-533`**:
  - `formSchema` line 107 only allows `feed: z.enum(['main', 'subfeed'])` — `'user'` is not even in the Zod enum!
  - Line 130 defaults `feed` to `initialValues?.feed ?? defaultFeed ?? 'main'`.
  - Lines 529-532 hardcode `feedOptions` to `['main', 'subfeed']`.
- **`src/components/posts/PostSubmitForm.tsx:32-85` & `156-177`**:
  - `formSchema` line 60 only allows `feed: z.enum(['user', 'subfeed'])` (missing `'main'` for site-wide editorial publishers).
  - Lines 173-176 hardcode `feedOptions` to `['user', 'subfeed']`.
- **`src/components/subfeeds/SubmissionDestinationFields.tsx:53-140`**:
  - Renders a `<Select>` for `feedName` whenever `!lockDestination`, even if there is only 1 option (`'user'`).
- **`src/app/(frontend)/new-link/page.tsx:15-38` & `src/app/(frontend)/new-post/page.tsx:15-38`**:
  - Both already filter `availableSubfeeds` using `canModerateCommunity(user) ? subfeeds : subfeeds.filter((subfeed) => canSubmitToSubfeed(subfeed, user.id))`, which automatically picks up #23's updated `canSubmitToSubfeed`, but neither passes `canPublishToMain` (`canManageSubmittedLinks(user)`) to `LinkSubmitForm` / `PostSubmitForm`.
- **`src/app/(frontend)/subfeeds/[slug]/page.tsx:258` & `728-743` & `798-839`**:
  - `canCreate` at line 258 is `user ? canSubmitToSubfeed(subfeed, user.id) || canModerateCommunity(user) : false`.
  - When `canCreate` is false (e.g. a joined membership-only user or non-member viewing the SubFeed), the empty state at line 820 shows `guestTitle` / `JoinSubfeedButton`, and `dict.subfeeds.joinToPost` (line 298) / `dict.subfeeds.emptyFeed.guestSubtitle` (line 274) falsely say `"Join this SubFeed to share the first link or post"`. Furthermore, signed-in ineligible users on `/subfeeds/[slug]` need an explicit explanation that SubFeed publishing requires a local publishing role plus a direct path to publish to their own User Feed (`/new-link` / `/new-post`).
- **Required Next.js Docs to Read Before Coding**:
  - `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`

#### C.24.4 Locked Design Decisions (Do Not Re-open)

1. **Consume `getPublishingDestinationEligibility` Across All Entry Points**:
   - **Decision**:
     - `src/app/(frontend)/page.tsx`, `src/app/(frontend)/new-link/page.tsx`, and `src/app/(frontend)/new-post/page.tsx` call `getPublishingDestinationEligibility(user, subfeeds)` from `src/lib/community/subfeeds.ts` (introduced in #23) and pass `canPublishToMain={eligibility.canPublishToMain}` and `subfeeds={eligibility.eligibleSubfeeds}` into `HomeContributeCard`, `LinkSubmitForm`, and `PostSubmitForm`.
   - **Rationale**: Single source of truth for destination eligibility; zero policy duplication in client components.

2. **Home Contribute Card Personal-First Experience (`HomeContributeCard.client.tsx`)**:
   - **Decision**:
     - Every signed-in user (`variant === 'member'` or `variant === 'noSubfeeds'`) sees the primary publishing buttons (`Share a link` / `Start a discussion`) under an "Add to your feed" header (`dict.pages.contribute.memberTitle`), plus a secondary link to browse SubFeeds (`/subfeeds`) when `variant === 'noSubfeeds'`.
     - Both Home modals (`LinkSubmitForm` and `PostSubmitForm`) pass `defaultFeed="user"` (never `defaultFeed="subfeed"`), `subfeeds={eligibleSubfeeds}`, and `canPublishToMain={canPublishToMain}`.
   - **Rationale**: Newcomers with no joined SubFeeds and membership-only users can publish immediately from Home into their own User Feed.

3. **Destination Selector Presentation (`SubmissionDestinationFields.tsx`, `LinkSubmitForm.tsx`, `PostSubmitForm.tsx`)**:
   - **Decision**:
     - Both `LinkSubmitForm` and `PostSubmitForm` support `feed: z.enum(['user', 'subfeed', 'main'])` with default `initialValues?.feed ?? defaultFeed ?? 'user'`.
     - Build `feedOptions` dynamically from authoritative props:
       - Always include `{ value: 'user', label: dict.linkForm.destinationOptions.user }` (or `postForm`).
       - Include `{ value: 'subfeed', label: ... }` **only** when `subfeeds.length > 0` (or `mode === 'edit'`).
       - Include `{ value: 'main', label: ... }` **only** when `canPublishToMain === true` (or `mode === 'edit'`).
     - In `SubmissionDestinationFields.tsx`:
       - When `lockDestination` is true (e.g., inside `SubfeedCreatePanel` on `/subfeeds/[slug]`), render no destination selector (preserving existing SubFeed modal behavior).
       - When `!lockDestination && feedOptions.length === 1` (ordinary member where only `'user'` is permitted), do **not** render a `<Select>` dropdown; instead render a clear static summary box (`data-testid="destination-user-feed-summary"`) displaying `labels.destinationLabel` (`Destination: Your Feed`) and `labels.personalFeedNotice` explaining that their User Feed is public and engagement can earn Main Feed reach.
       - When `!lockDestination && feedOptions.length > 1` (privileged publisher with SubFeed local role or site-wide editorial role), render the `<Select>` dropdown defaulting to `'user'` (unless `defaultFeed` was explicitly passed), alongside the helper description.
   - **Rationale**: Satisfies AC 2, 3, 4, and 5 cleanly while keeping `QuickEditLinkButton` (`mode="edit"`) working for admins.

4. **SubFeed Page Ineligible Member Guidance (`src/app/(frontend)/subfeeds/[slug]/page.tsx`)**:
   - **Decision**: On `/subfeeds/[slug]`, when `user` is signed in and `!canCreate`:
     - Show a concise note in the Top Content header/empty state (`dict.subfeeds.personalPublishFallback`) explaining that publishing into this SubFeed requires a local publishing role (uploader, editor, moderator, or owner), and offering direct links to publish to their own User Feed (`/new-link` and `/new-post`).
     - Update `dict.subfeeds.joinToPost` and `dict.subfeeds.emptyFeed.guestSubtitle` (EN & SV) so they do not claim that joining alone grants SubFeed publishing permission.
   - **Rationale**: Meets AC 4 ("Eligible SubFeed entry journeys retain that SubFeed context; ineligible users receive an explicit explanation and a personal-publishing path").

#### C.24.5 Ordered Steps (`[impl]` / `[test]`)

- **Step 24.1 `[impl]` — Update EN/SV dictionary strings in `src/lib/dictionaries.ts`**
  - **Goal**: Add and update English and Swedish strings for personal-first Home contribution, User Feed destination option in `linkForm` and `postForm`, static User Feed destination notice, and SubFeed local-role publishing notice.
  - **Files**: `src/lib/dictionaries.ts`
  - **Exact Change Intent**:
    1. In `en.pages.contribute` & `sv.pages.contribute`: Update `memberTitle` (`'Add to your feed'` / `'Lägg till i ditt flöde'`), `memberSubtitle` (`'Publish links and posts to your public User Feed. Strong community engagement can lift them into the Main Feed.'` / `'Publicera länkar och inlägg i ditt offentliga användarflöde. Starkt engagemang kan lyfta dem till huvudflödet.'`), `shareLinkModalTitle` (`'Add a link to your feed'` / `'Lägg till en länk i ditt flöde'`), `startDiscussionModalTitle` (`'Write a post for your feed'` / `'Skriv ett inlägg i ditt flöde'`), `noSubfeedsTitle` (`'Add to your feed'` / `'Lägg till i ditt flöde'`), `noSubfeedsSubtitle` (`'Your public User Feed is ready right away—no SubFeed required. Share a link or post, and strong engagement can earn Main Feed reach.'` / `'Ditt offentliga användarflöde är redo direkt – inget delflöde krävs. Dela en länk eller ett inlägg, så kan starkt engagemang ge räckvidd i huvudflödet.'`).
    2. In `en.linkForm` & `sv.linkForm` and `en.postForm` & `sv.postForm`:
       - Ensure `destinationOptions` includes `user: 'Your Feed'` (`'Ditt flöde'`), `subfeed: 'SubFeed'` (`'Delflöde'`), and `main: 'Main Feed'` (`'Huvudflöde'`).
       - Update `destinationDesc` (`'Starts in your public User Feed unless you select an authorized editorial destination. Engagement can earn Main Feed reach.'` / `'Börjar i ditt offentliga användarflöde om du inte väljer en behörig redaktionell destination. Engagemang kan ge räckvidd i huvudflödet.'`).
       - Add `personalFeedOnlyNote`: `'Published to your public User Feed. Community engagement can lift eligible items into the Main Feed.'` / `'Publiceras i ditt offentliga användarflöde. Engagemang i communityn kan lyfta kvalificerat innehåll till huvudflödet.'`.
    3. In `en.subfeeds` & `sv.subfeeds`:
       - Update `joinToPost` and `emptyFeed.guestSubtitle` so they state that SubFeed publishing requires a local publishing role while anyone can join to follow and discuss.
       - Add `ineligiblePublishNote`: `'Publishing here requires a local SubFeed role (uploader, editor, moderator, or owner). You can publish to your own public User Feed anytime.'` / `'Att publicera här kräver en lokal roll i delflödet (uppladdare, redaktör, moderator eller ägare). Du kan alltid publicera i ditt eget offentliga användarflöde.'` and `publishToYourFeedAction`: `'Add to your feed'` / `'Lägg till i ditt flöde'`.
  - **Proving Command**: `pnpm run typecheck`

- **Step 24.2 `[impl]` — Update `SubmissionDestinationFields.tsx`, `LinkSubmitForm.tsx`, `PostSubmitForm.tsx`, and `QuickEditLinkButton.tsx`**
  - **Goal**: Make both forms default to `'user'`, build `feedOptions` from authorized props (`subfeeds` and `canPublishToMain`), and render a clear static User Feed notice when only `'user'` is permitted.
  - **Files**: `src/components/subfeeds/SubmissionDestinationFields.tsx`, `src/components/links/LinkSubmitForm.tsx`, `src/components/posts/PostSubmitForm.tsx`, `src/components/links/QuickEditLinkButton.tsx`
  - **Exact Change Intent**:
    1. In `SubmissionDestinationFields.tsx`:
       - Add `personalFeedOnlyNote?: string` to `labels`.
       - When `!lockDestination && feedOptions.length === 1 && feedOptions[0]?.value === 'user'`, render a bordered info box (`data-testid="destination-user-feed-summary"`) showing `labels.destinationLabel`: `feedOptions[0].label` (`Your Feed` / `Ditt flöde`) and `labels.personalFeedOnlyNote ?? labels.destinationDesc`, instead of the `<Select>` control.
    2. In `LinkSubmitForm.tsx`:
       - Accept `canPublishToMain?: boolean` and widen `defaultFeed?: 'user' | 'main' | 'subfeed'` and `initialValues.feed?: 'user' | 'main' | 'subfeed'`.
       - Update `formSchema` `feed` to `z.enum(['user', 'main', 'subfeed'])` and default `feed` to `initialValues?.feed ?? defaultFeed ?? 'user'`.
       - Build `feedOptions` dynamically: always `{ value: 'user', label: dict.linkForm.destinationOptions.user }`, plus `{ value: 'subfeed', label: dict.linkForm.destinationOptions.subfeed }` when `subfeeds.length > 0 || mode === 'edit'`, plus `{ value: 'main', label: dict.linkForm.destinationOptions.main }` when `canPublishToMain || mode === 'edit'`.
    3. In `PostSubmitForm.tsx`:
       - Accept `canPublishToMain?: boolean` and widen `defaultFeed?: 'user' | 'main' | 'subfeed'`.
       - Update `formSchema` `feed` to `z.enum(['user', 'main', 'subfeed'])` and default `feed` to `defaultFeed ?? 'user'`.
       - Build `feedOptions` dynamically using the same rule (`'user'`, `'subfeed'` if `subfeeds.length > 0`, `'main'` if `canPublishToMain`).
    4. In `QuickEditLinkButton.tsx`: Widen `link.feed?: 'main' | 'subfeed' | 'user' | null`.
  - **Proving Command**: `pnpm run typecheck`

- **Step 24.3 `[impl]` — Wire `getPublishingDestinationEligibility` into Home, `/new-link`, `/new-post`, and `/subfeeds/[slug]`**
  - **Goal**: Connect server pages and `HomeContributeCard` to #23's eligibility contract and provide personal-publishing actions everywhere.
  - **Files**: `src/app/(frontend)/page.tsx`, `src/components/links/HomeContributeCard.client.tsx`, `src/app/(frontend)/new-link/page.tsx`, `src/app/(frontend)/new-post/page.tsx`, `src/app/(frontend)/subfeeds/[slug]/page.tsx`
  - **Exact Change Intent**:
    1. In `src/app/(frontend)/page.tsx`: Call `getPublishingDestinationEligibility(user, subfeeds)` when `user` is signed in; pass `eligibleSubfeeds={publishingEligibility.eligibleSubfeeds}` and `canPublishToMain={publishingEligibility.canPublishToMain}` to `HomeContributeCard`.
    2. In `src/components/links/HomeContributeCard.client.tsx`:
       - Accept `eligibleSubfeeds?: HomeContributeCardSubfeed[]` and `canPublishToMain?: boolean`.
       - In `renderActions()`, for **both** `variant === 'member'` and `variant === 'noSubfeeds'`, render the primary `shareLinkAction` and `startDiscussionAction` buttons that open the Link and Post modals! When `variant === 'noSubfeeds'`, also render `browseSubfeedsAction` (`/subfeeds`) as a ghost/secondary link so discovery remains accessible without being a prerequisite.
       - In both Home modals (`LinkSubmitForm` and `PostSubmitForm`), pass `subfeeds={eligibleSubfeeds}`, `canPublishToMain={canPublishToMain}`, `defaultFeed="user"`, and `defaultSubfeedId={undefined}`.
    3. In `src/app/(frontend)/new-link/page.tsx` and `src/app/(frontend)/new-post/page.tsx`: Use `getPublishingDestinationEligibility(user, subfeeds)` and pass `subfeeds={eligibility.eligibleSubfeeds}` and `canPublishToMain={eligibility.canPublishToMain}` to `LinkSubmitForm` / `PostSubmitForm`.
    4. In `src/app/(frontend)/subfeeds/[slug]/page.tsx`: When `user && !canCreate`, display `dict.subfeeds.ineligiblePublishNote` with links to `/new-link` and `/new-post` (`dict.subfeeds.publishToYourFeedAction`).
  - **Proving Command**: `pnpm run typecheck && pnpm run lint`

- **Step 24.4 `[test]` — Add integration/unit verification of destination options & Home/standalone defaults**
  - **Goal**: Verify destination option construction for newcomers, membership-only users, local SubFeed publishers, and site-wide editors.
  - **Files**: `tests/vitest/int/subfeed-roles.int.spec.ts`
  - **Exact Change Intent**: Add test cases verifying `getPublishingDestinationEligibility` for:
    1. Newcomer with no joined SubFeeds → `defaultFeed: 'user'`, `allowedFeeds: ['user']`, `eligibleSubfeeds: []`, `canPublishToMain: false`, `hasMultipleDestinations: false`.
    2. Member who joined 2 SubFeeds as plain `member` → `defaultFeed: 'user'`, `allowedFeeds: ['user']`, `eligibleSubfeeds: []`, `canPublishToMain: false`, `hasMultipleDestinations: false`.
    3. Local `uploader` in SubFeed A and plain `member` in SubFeed B → `defaultFeed: 'user'`, `allowedFeeds: ['user', 'subfeed']`, `eligibleSubfeeds` contains only SubFeed A, `canPublishToMain: false`, `hasMultipleDestinations: true`.
    4. Site-wide `editor` or `uploader` → `defaultFeed: 'user'`, `canPublishToMain: true`, `allowedFeeds` contains `'main'`, `hasMultipleDestinations: true`.
  - **Proving Command**:
    ```bash
    pnpm exec vitest run tests/vitest/int/subfeed-roles.int.spec.ts
    ```

#### C.24.6 Safeguards
- **Local API + user (`overrideAccess: false`)**: Keep `user, overrideAccess: false` on all `payload.find` calls in `page.tsx`, `new-link/page.tsx`, `new-post/page.tsx`, and `subfeeds/[slug]/page.tsx`.
- **UI primitives (`AGENTS.md`)**: Use `src/components/ui/modal.tsx` and `src/components/ui/select.tsx`; do not introduce ad-hoc dialog markup.
- **Truthful EN/SV copy**: Never describe User Feeds as private and never promise automatic Main Feed promotion.

#### C.24.7 Verification Commands
```bash
pnpm exec vitest run tests/vitest/int/subfeed-roles.int.spec.ts tests/vitest/int/subfeed-eligibility.int.spec.ts
pnpm run typecheck
pnpm run lint
````

#### C.24.8 Definition of Done & Stop-and-Ask Triggers

- **Definition of Done**:
  - Signed-in newcomers with no joined SubFeeds see `Share a link` and `Start a discussion` on Home under `Add to your feed`.
  - Both Home modals and `/new-link` + `/new-post` default to `'user'` (`Your Feed` / `Ditt flöde`) and show the static destination summary instead of a dropdown when the user has no SubFeed/Main publishing privileges.
  - Privileged local and site-wide publishers still see their authorized SubFeed/Main options, and `/subfeeds/[slug]` retains locked SubFeed context for authorized publishers while giving ineligible signed-in members an explicit explanation and personal-publishing link.
  - Targeted tests, `pnpm run typecheck`, and `pnpm run lint` exit 0.
- **Stop-and-Ask Triggers**:
  - If any caller outside `page.tsx`, `new-link/page.tsx`, `new-post/page.tsx`, `SubfeedCreatePanel.tsx`, `HomeContributeCard.client.tsx`, or `QuickEditLinkButton.tsx` renders `LinkSubmitForm` or `PostSubmitForm`.

#### C.24.9 Self-Contained Handoff Prompt for Issue #24

````markdown
You are the implementation agent (`opencode-go/deepseek-v4.1-flash`) in `/Users/royal/www/v4`.
Your task is to implement **Issue #24: Make Home and submission forms start with Add to your feed**.

### Required Reading First

1. `AGENTS.md`
2. `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `07-mutating-data.md`, and `03-api-reference/01-directives/use-client.md`
3. `.agents/implementations/PLAN_PERSONAL_FEED_PUBLISHING.md` Section C (Issue #24)

### Locked Decisions & Exact Changes

1. **`src/lib/dictionaries.ts`**: Update EN and SV strings for `pages.contribute`, `linkForm`, `postForm`, and `subfeeds` as specified in Plan Step 24.1.
2. **`src/components/subfeeds/SubmissionDestinationFields.tsx`, `src/components/links/LinkSubmitForm.tsx`, `src/components/posts/PostSubmitForm.tsx`, `src/components/links/QuickEditLinkButton.tsx`**:
   - Default `feed` to `'user'` in both `LinkSubmitForm` and `PostSubmitForm`.
   - Build `feedOptions` dynamically from `subfeeds` (already filtered to eligible publishing SubFeeds) and `canPublishToMain`.
   - When `!lockDestination && feedOptions.length === 1 && feedOptions[0]?.value === 'user'`, render a static destination notice (`data-testid="destination-user-feed-summary"`) in `SubmissionDestinationFields` instead of a `<Select>`.
3. **`src/app/(frontend)/page.tsx`, `src/components/links/HomeContributeCard.client.tsx`, `src/app/(frontend)/new-link/page.tsx`, `src/app/(frontend)/new-post/page.tsx`, `src/app/(frontend)/subfeeds/[slug]/page.tsx`**:
   - Consume `getPublishingDestinationEligibility(user, subfeeds)` from `src/lib/community/subfeeds.ts`.
   - On Home (`HomeContributeCard.client.tsx`), show `Share a link` and `Start a discussion` for both `member` and `noSubfeeds` variants, and pass `defaultFeed="user"`, `subfeeds={eligibleSubfeeds}`, and `canPublishToMain={canPublishToMain}` to both modals.
   - On `/subfeeds/[slug]`, when `user && !canCreate`, render `dict.subfeeds.ineligiblePublishNote` and links to `/new-link` and `/new-post`.
4. **`tests/vitest/int/subfeed-roles.int.spec.ts`**: Add unit tests for `getPublishingDestinationEligibility` across newcomer, membership-only, local publisher, and editorial publisher cases (Step 24.4).

### Verification

```bash
pnpm exec vitest run tests/vitest/int/subfeed-roles.int.spec.ts tests/vitest/int/subfeed-eligibility.int.spec.ts
pnpm run typecheck
pnpm run lint
```
````

````

---

### Issue #25: Show truthful publication outcomes and a path to the submitted item

#### C.25.1 Objective
Make the post-submission experience in `LinkSubmitForm`, `PostSubmitForm`, and `HomeContributeCard` report the actual persisted outcome returned by #23's `submitLink` and `submitPost` server actions. When an item is published to the member's User Feed (or an authorized SubFeed / Main Feed), confirm its destination and public visibility and provide a direct, clickable path to the created item (`/link/[id]` or `/post/[id]`) as well as the destination feed. When an item is persisted as `pending` or `blocked`, explain that state honestly without claiming public visibility, and when an action throws an error, keep the user's form input intact and display the actionable error message.

#### C.25.2 Acceptance Criteria Checklist
- [ ] Successful personal submission identifies the member's User Feed and explicitly confirms public visibility only when the persisted outcome supports it.
- [ ] Provide a direct, usable path to the actual submitted item for both content kinds, from Home modal and standalone submissions. Keep ownership/feed context understandable without depending on a future profile redesign.
- [ ] Where existing safety/moderation behavior produces a pending or blocked outcome, explain it explicitly; do not display a public-success message. Only offer item destinations the member may access.
- [ ] Failed submissions retain useful input and show an actionable error. No silent catch, success-shaped fallback, or unconditional modal close/reset on failure.
- [ ] Completion consumes #23's authoritative outcome; do not infer publication state from the selected destination or repeat policy in the form.
- [ ] Modal dismissal/navigation and refresh/revalidation preserve existing accessibility and expose the persisted item without requiring an unrelated manual reload.
- [ ] English and Swedish copy agree on destination and visibility; neither calls public personal content private nor guarantees Main Feed promotion.
- [ ] Focused tests cover public success for links/posts and non-public/error feedback using the existing test setup. Do not invent a new production moderation mechanism merely to produce a fixture.

#### C.25.3 Findings from Current Code
- **`src/components/links/LinkSubmitForm.tsx:269-299`**:
  - Calls `await submitLink(...)`, ignores the return value, shows generic `toast.success(dict.linkForm.submitSuccess)` (`'Link submitted successfully!'`), resets the form, and calls `onSuccess?.()`.
  - On error (`catch (error)` at line 293), logs to console and shows generic `toast.error(dict.linkForm.submitError)` (`'Failed to submit link. Please try again.'`), discarding the specific policy/validation message from the server action!
- **`src/components/posts/PostSubmitForm.tsx:88-113`**:
  - Calls `await submitPost(...)`, ignores the return value, shows generic `toast.success(dict.postForm.submitSuccess)`, resets the form, and calls `onSuccess?.()`.
  - On error (line 107), shows generic `toast.error(dict.postForm.submitError)`.
- **`src/components/links/HomeContributeCard.client.tsx:82-90`**:
  - `handleLinkSuccess` and `handlePostSuccess` immediately close the modal (`setLinkOpen(false)` / `setPostOpen(false)`) and call `router.refresh()`, leaving the user on Home (where a freshly created User Feed link or post does **not** appear yet because it hasn't been promoted to the Main Feed!) with no link to `/link/[id]`, `/post/[id]`, or `/user/[username]`.
- **`src/components/subfeeds/SubfeedCreatePanel.tsx:32-35`**:
  - `handleSuccess` immediately closes the modal and calls `router.refresh()`.
- **Required Next.js Docs to Read Before Coding**:
  - `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`
  - `node_modules/next/dist/docs/01-app/01-getting-started/09-revalidating.md`
  - `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md`

#### C.25.4 Locked Design Decisions (Do Not Re-open)

1. **How Real Persisted Publication State Reaches the UI (`SubmissionOutcome` Flow)**:
   - **Decision**:
     - `submitLink` and `submitPost` return `Promise<SubmissionOutcome>` (implemented in #23).
     - `LinkSubmitForm` and `PostSubmitForm` change their callback prop signature to `onSuccess?: (outcome: SubmissionOutcome) => void` and maintain local state `lastOutcome: SubmissionOutcome | null` and `submitErrorMessage: string | null`.
     - When `submitLink` / `submitPost` resolves with `outcome`:
       - Store `setLastOutcome(outcome)` and clear `setSubmitErrorMessage(null)`.
       - Reset form inputs **only** when the call succeeded (`outcome` returned).
       - Trigger a truthful toast based on `outcome.visibility` (`published` vs `pending` vs `blocked`) and render an inline completion banner (`data-testid="submission-outcome-banner"`) inside the form/card (or in `HomeContributeCard` when inside a Home modal if the user closes or keeps the modal open — even better: keep the inline outcome state visible inside the form AND in `HomeContributeCard`!).
       - Specifically: in `LinkSubmitForm` and `PostSubmitForm`, when `lastOutcome` is present, render the truthful outcome banner (`data-testid="submission-outcome-banner"`) right at the top of the Card showing:
         1. **Heading & Visibility explanation**:
            - If `outcome.visibility === 'published'`: confirms the item is **published and publicly readable** in `outcome.destinationLabel` (`Your User Feed`, `SubFeed: <name>`, or `Main Feed`), and if `outcome.feed === 'user'`, notes that community engagement can earn Main Feed reach.
            - If `outcome.visibility === 'pending'`: explains honestly that the item was saved to `outcome.destinationLabel` as **pending moderation/review** and is **not publicly visible yet** (only visible to the author and moderators).
            - If `outcome.visibility === 'blocked'`: explains honestly that the item is **blocked/quarantined by safety checks** and is **not publicly visible**.
         2. **Direct Navigation Links**:
            - When `outcome.itemHref` is non-null (`visibility === 'published' || visibility === 'pending'`), render a primary button/link (`data-testid="submission-outcome-item-link"`) to `outcome.itemHref` (`View link` -> `/link/[id]` or `View post` -> `/post/[id]`). When `outcome.visibility === 'blocked'`, `outcome.itemHref` is `null` and no inaccessible item link is rendered.
            - Render a secondary link (`data-testid="submission-outcome-feed-link"`) to `outcome.destinationHref` (`Open your User Feed` -> `/user/[username]?tab=links|posts`, `Open SubFeed` -> `/subfeeds/[slug]`, or `Back to Main Feed` -> `/`).
     - In `HomeContributeCard.client.tsx` and `SubfeedCreatePanel.tsx`:
       - Do **not** unconditionally close the modal on submit before the user can see or click the outcome! Instead, in `onSuccess(outcome)`:
         - Call `router.refresh()` so background server data revalidates immediately.
         - Also store `lastOutcome` in `HomeContributeCard` so that if the user closes the modal, a compact dismissible outcome bar remains visible on the `HomeContributeCard` itself with the same `View item` (`outcome.itemHref`) and `Open your User Feed` (`outcome.destinationHref`) links!
   - **Rationale**: Whether the user stays in the modal, closes the modal on Home, or submits from `/new-link` or `/new-post`, they immediately see the truthful persisted visibility state (`published`, `pending`, or `blocked`) and have a one-click link to `/link/[id]` or `/post/[id]` and their User Feed.

2. **Actionable Error Preservation on Failure**:
   - **Decision**:
     - When `submitLink` or `submitPost` throws an `Error`, do **not** call `form.reset()`, do **not** call `onSuccess()`, and do **not** close the modal.
     - Extract the error message (`error instanceof Error && error.message ? error.message : dict.linkForm.submitError`), set `submitErrorMessage(message)`, render an accessible alert (`role="alert"`, `data-testid="submission-error-alert"`) inside the form, and pass `message` to `toast.error(message)`.
   - **Rationale**: Preserves all user-typed fields (`title`, `url`, `description`, `content`) and surfaces #23's exact policy error if role/membership changed before submission.

#### C.25.5 Ordered Steps (`[impl]` / `[test]`)

- **Step 25.1 `[impl]` — Add EN/SV outcome and error dictionary entries in `src/lib/dictionaries.ts`**
  - **Goal**: Provide localized strings in `en` and `sv` for `published`, `pending`, and `blocked` outcomes across `user`, `subfeed`, and `main` destinations, plus action labels (`viewSubmittedLink`, `viewSubmittedPost`, `openUserFeed`, `openSubfeed`, `openMainFeed`).
  - **Files**: `src/lib/dictionaries.ts`
  - **Exact Change Intent**: Add `submissionOutcome` section under both `en` and `sv` in `src/lib/dictionaries.ts` with matching English and Swedish copy that explicitly distinguishes public (`published`), pending review (`pending`), and blocked (`blocked`) outcomes without calling personal content private or guaranteeing promotion.
  - **Proving Command**: `pnpm run typecheck`

- **Step 25.2 `[impl]` — Render truthful outcome banner and error alert in `LinkSubmitForm`, `PostSubmitForm`, `HomeContributeCard`, and `SubfeedCreatePanel`**
  - **Goal**: Wire `SubmissionOutcome` from `submitLink` and `submitPost` into `LinkSubmitForm.tsx`, `PostSubmitForm.tsx`, `HomeContributeCard.client.tsx`, and `SubfeedCreatePanel.tsx`.
  - **Files**: `src/components/links/LinkSubmitForm.tsx`, `src/components/posts/PostSubmitForm.tsx`, `src/components/links/HomeContributeCard.client.tsx`, `src/components/subfeeds/SubfeedCreatePanel.tsx`
  - **Exact Change Intent**:
    1. In `LinkSubmitForm.tsx` and `PostSubmitForm.tsx`:
       - Capture `const outcome = await submitLink(...)` / `const outcome = await submitPost(...)`.
       - Set `lastOutcome(outcome)`, clear `submitErrorMessage(null)`, reset form fields, show visibility-specific toast (`toast.success` only when `outcome.isPublic`, `toast.info`/`toast.warning` when `pending`/`blocked`), and call `onSuccess?.(outcome)`.
       - Render `data-testid="submission-outcome-banner"` when `lastOutcome` is set, including `data-testid="submission-outcome-item-link"` (when `lastOutcome.itemHref` is non-null) and `data-testid="submission-outcome-feed-link"`.
       - On catch: keep form values, set `submitErrorMessage`, render `role="alert"` (`data-testid="submission-error-alert"`), and call `toast.error(message)`.
    2. In `HomeContributeCard.client.tsx` and `SubfeedCreatePanel.tsx`:
       - Update `handleLinkSuccess(outcome)` and `handlePostSuccess(outcome)` to call `router.refresh()` while keeping the outcome accessible (keep modal open showing the outcome banner AND store `lastOutcome` on `HomeContributeCard` so if the modal is dismissed, the outcome banner with `itemHref` and `destinationHref` remains visible on the card).
  - **Proving Command**: `pnpm run typecheck && pnpm run lint`

- **Step 25.3 `[test]` — Add focused integration tests for `SubmissionOutcome` states (`published`, `pending`, `blocked`) and error rejection**
  - **Goal**: Verify that `derivePersistedPublicationState` and the publishing pipeline produce truthful `published`, `pending`, and `blocked` outcomes and only expose `itemHref` when the viewer can access the item.
  - **Files**: `tests/vitest/int/subfeed-eligibility.int.spec.ts`
  - **Exact Change Intent**:
    - Test `derivePersistedPublicationState` and collection creation outcomes for:
      1. Public User Feed link and post (`visibility === 'published'`, `isPublic === true`, `itemHref === '/link/<id>'` / `'/post/<id>'`, `destinationHref === '/user/<username>?tab=...'`).
      2. Pending link (`draft: true` -> `_status === 'draft'`) and pending post (`context: { forcePending: true }` -> `status === 'pending'`): `visibility === 'pending'`, `isPublic === false`, `itemHref` present for author, and anonymous read returns 0 docs while author read (`user, overrideAccess: false`) returns 1 doc.
      3. Blocked/quarantined link (`quarantined: true` or `softDeleted: true`) and post (`quarantined: true` or `status: 'removed'`): `visibility === 'blocked'`, `isPublic === false`, `itemHref === null`, and author non-moderator read returns 0 docs.
  - **Proving Command**:
    ```bash
    pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts
    ```

#### C.25.6 Safeguards
- **Never claim public visibility for pending/blocked items**: `isPublic` is true ONLY when `visibility === 'published'`.
- **Keep item links within viewer access rights**: `itemHref` must be `null` when `visibility === 'blocked'` (`quarantined`, `softDeleted`, or `removed`), because `readAccess` in `Links` and `Posts` denies even the author access to quarantined/soft-deleted/removed docs.
- **Retain input on failure**: Never call `form.reset()` in `catch` or `finally`.

#### C.25.7 Verification Commands
```bash
pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts tests/vitest/int/subfeed-roles.int.spec.ts
pnpm run typecheck
pnpm run lint
````

#### C.25.8 Definition of Done & Stop-and-Ask Triggers

- **Definition of Done**:
  - Submitting a link or post from Home or `/new-link` / `/new-post` renders the truthful outcome banner with destination label, accurate visibility status, and clickable links to `/link/[id]` or `/post/[id]` and `/user/[username]?tab=...`.
  - Pending and blocked outcomes never display a public-success message or inaccessible item link.
  - Failed submissions retain all user input and render `role="alert"` with the actionable error message.
  - Targeted tests, `pnpm run typecheck`, and `pnpm run lint` exit 0.
- **Stop-and-Ask Triggers**:
  - If any route path for item detail (`/link/[id]`, `/post/[id]`) or user profile (`/user/[username]`) differs from what is mounted under `src/app/(frontend)/`. (Verified in recon: they are `/link/[id]`, `/post/[id]`, and `/user/[username]`.)

#### C.25.9 Self-Contained Handoff Prompt for Issue #25

````markdown
You are the implementation agent (`opencode-go/deepseek-v4.1-flash`) in `/Users/royal/www/v4`.
Your task is to implement **Issue #25: Show truthful publication outcomes and a path to the submitted item**.

### Required Reading First

1. `AGENTS.md`
2. `node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md` and `09-revalidating.md`
3. `.agents/implementations/PLAN_PERSONAL_FEED_PUBLISHING.md` Section C (Issue #25)

### Locked Decisions & Exact Changes

1. **`src/lib/dictionaries.ts`**: Add `submissionOutcome` strings in both `en` and `sv` covering `published`, `pending`, and `blocked` states, destination names, and navigation CTAs (`viewSubmittedLink`, `viewSubmittedPost`, `openUserFeed`, `openSubfeed`, `openMainFeed`).
2. **`src/components/links/LinkSubmitForm.tsx` & `src/components/posts/PostSubmitForm.tsx`**:
   - Consume the `SubmissionOutcome` returned by `submitLink` / `submitPost`.
   - Render `data-testid="submission-outcome-banner"` showing the actual destination and visibility (`published`, `pending`, or `blocked`), with `data-testid="submission-outcome-item-link"` (when `outcome.itemHref` is non-null) and `data-testid="submission-outcome-feed-link"`.
   - On error, keep all form values intact and render `role="alert"` (`data-testid="submission-error-alert"`) with the error message.
3. **`src/components/links/HomeContributeCard.client.tsx` & `src/components/subfeeds/SubfeedCreatePanel.tsx`**:
   - On submission success, call `router.refresh()` and keep the outcome banner & direct links accessible to the user.
4. **`tests/vitest/int/subfeed-eligibility.int.spec.ts`**: Add integration tests covering `published`, `pending`, and `blocked` outcomes and reader access rights (Plan Step 25.3).

### Verification

```bash
pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts tests/vitest/int/subfeed-roles.int.spec.ts
pnpm run typecheck
pnpm run lint
```
````

````

---

### Issue #26: Verify newcomer publishing journeys and document the personal-first model

#### C.26.1 Objective
Verify the end-to-end newcomer and local-publisher journeys in Playwright and align the English (`/how-it-works`) and Swedish (`/hur-det-funkar`) documentation with the personal-first publishing model. Prove in a real browser that a newcomer with no joined SubFeeds can publish both a link and a post to their own User Feed, see truthful public-visibility feedback, navigate to the created item, and have that item publicly readable by other viewers. Confirm the curated seed and rerun behavior on the isolated test database.

#### C.26.2 Acceptance Criteria Checklist
- [ ] After #27, prepare a fresh isolated test database using the documented supported schema/migration setup, run the curated seed, inspect the named Home/personal/Subfeed scenarios against its manifest, and rerun to verify stable identities and no duplicated interactions. Record actual commands/results. Do not reset or seed an existing/shared/production database, and do not make all existing tests depend on the complete demo seed.
- [ ] Using existing authenticated Playwright fixtures, a newcomer with no joined SubFeeds can start from Home, submit a unique link to their own User Feed, understand public-success feedback and reach the persisted item.
- [ ] Cover the equivalent post journey and standalone submission paths with a small parameterised/focused set rather than a full combinatorial suite.
- [ ] Verify public readability separately from owner readability and from a success toast; assert the actual personal destination, not merely successful creation.
- [ ] A joined membership-only user still cannot publish into that SubFeed. Cover direct/tampered submission enforcement in the focused integration tests from #23 rather than restating the same browser scenario repeatedly.
- [ ] Preserve meaningful checks that authorised local publishers can use their own SubFeed without obtaining unrelated local/global permissions.
- [ ] Where the existing safety setup permits a deterministic pending/blocked fixture, verify honest feedback without a false public-success claim. Do not weaken safety or add production configuration just for tests.
- [ ] Keep existing promotion, standing, editorial-priority and safety lifecycle coverage intact; this task does not rewrite those policies or duplicate #20's entire workflow.
- [ ] Update existing English/Swedish How it works/publishing guidance as applicable: ordinary content starts in a public User Feed; engagement can earn direct Main Feed reach; SubFeeds are earned editorial spaces; joining alone does not grant publishing permission. A SubFeed is not a mandatory promotion rung.
- [ ] No public numeric progression targets, private-feed claims, guaranteed promotion or suggestion that newcomers must create/join a SubFeed to contribute.
- [ ] Run the targeted integration/browser checks and typecheck/lint needed for this milestone. Record commands and any environmental blockers explicitly in the implementation handoff; do not report unexecuted tests as passing.

#### C.26.3 Findings from Current Code
- **`src/app/(frontend)/how-it-works/page.tsx` & `src/app/(frontend)/hur-det-funkar/page.tsx`**:
  - `how-it-works/page.tsx:144-147` (`localRoleGuides`) states: `{ role: 'Member', description: 'Can submit content and take part in the SubFeed community.' }`. Line 433 states: `'Posting to a SubFeed requires membership or a local uploader, editor, moderator, or owner role.'` — **both are now false under #23!**
  - `hur-det-funkar/page.tsx:150-153` (`localRoleGuides`) states: `{ role: 'Medlem', description: 'Kan skicka in innehåll och delta i delflödets community.' }`. Line 442 states: `'Att posta i ett delflöde kräver medlemskap eller en lokal roll som uppladdare, redaktör, moderator eller ägare.'` — **also false under #23!**
  - Furthermore, both pages currently display raw internal numeric formulas and thresholds (`discovery x 1.6 + ...`, `TRUST_LEVEL_THRESHOLDS` table, `candidateThreshold(...)` numbers, `MAIN_FEED_PROMOTION_THRESHOLD` numbers, `DISCOVERY_BOOST_MIN_SCORE`, `EDITORIAL_PRIORITY_BOOST`), whereas #26 AC 9 & 10 require explaining the personal-first publishing model clearly and removing public numeric progression/ranking threshold targets!
- **`tests/playwright/e2e/progression.setup.ts` & `tests/playwright/e2e/progression.e2e.spec.ts`**:
  - `progression.setup.ts:38-63` already sets up `newcomer` (`AUTH('newcomer')`, 0 joined SubFeeds), `qualified` (`AUTH('qualified')`, owns `qualifiedSubfeed`), and `localmod` (`AUTH('localmod')`, initially added to `members` of `qualifiedSubfeed` at line 221).
  - In `progression.e2e.spec.ts`, we can add a focused `test.describe('Personal-first publishing journeys (#26)')` block that reuses `AUTH('newcomer')`, `AUTH('localmod')`, and `AUTH('qualified')` without creating a separate slow setup project.
- **`tests/playwright/e2e/pages/LinkPage.ts:48-56`**:
  - Notice `LinkPage.createLink` (used by `tests/playwright/e2e/voting.e2e.spec.ts`) posts to `/api/links?draft=true` with `feed: 'main'` using `user.json` (which is `admin@mail.com`). Because `admin` has `canManageSubmittedLinks === true`, `voting.e2e.spec.ts` remains compatible, or we can also ensure `LinkPage.ts` works cleanly.
- **Required Next.js Docs to Read Before Coding**:
  - `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md`
  - `node_modules/next/dist/docs/02-pages/02-guides/testing/playwright.md`

#### C.26.4 Locked Design Decisions (Do Not Re-open)

1. **English & Swedish Guidance (`how-it-works/page.tsx` & `hur-det-funkar/page.tsx`)**:
   - **Decision**:
     - Add a top section ("Personal-First Publishing: Start in Your User Feed" / "Publicering börjar i ditt eget användarflöde") on both `/how-it-works` and `/hur-det-funkar` explaining:
       1. Every member's new links and posts start in their own **public User Feed** immediately when safety checks allow.
       2. Community engagement (votes, comments, clicks, discovery boosts, or editorial featuring) can lift eligible User Feed content **directly into the Main Feed** — a SubFeed is **not** a mandatory rung on the way to the Main Feed.
       3. SubFeeds are earned editorial spaces; **joining a SubFeed as a member lets you follow and participate in discussions, but does not grant publishing permission there**. Publishing into a SubFeed requires a local publishing role (`Owner`, `Moderator`, `Editor`, or `Uploader`).
     - Update `localRoleGuides` (`Member` / `Medlem`) and the "SubFeeds Compete in the Main Feed" bullet list in both languages so `Member` is described accurately (following the SubFeed and participating in comments/votes, while `Uploader`, `Editor`, `Moderator`, and `Owner` publish links and posts into the SubFeed).
     - Replace exposed internal numeric progression/promotion threshold numbers and raw point-weight equations on `/how-it-works` and `/hur-det-funkar` with qualitative explanations of the signals, trust levels (`Newcomer` through `Legend`), candidacy paths (`Uploader candidacy`, `Editor candidacy`, `Strong Recruiter standing`), and promotion gates, while keeping all existing section headings (`Point Classes`, `Standing, Decay & Trust Levels`, `Site Roles`, `Automatic Progression`, `SubFeeds`, `Main Feed and Ranking`, `Safety & Admin Controls`) intact so navigation and existing expectations remain stable.
   - **Rationale**: Directly satisfies #26 AC 9 and AC 10 in both English and Swedish.

2. **Focused Playwright Browser Suite (`tests/playwright/e2e/progression.e2e.spec.ts`)**:
   - **Decision**: Add `test.describe('Personal-first publishing journeys (#26)')` to `tests/playwright/e2e/progression.e2e.spec.ts` covering:
     1. **Newcomer (0 joined SubFeeds) link submission from Home modal**: Using `AUTH('newcomer')`, open Home (`/`), verify the `Add to your feed` card is visible with `Share a link` and `Start a discussion`, open `Share a link`, assert the static `Your Feed` destination summary is shown (and no `Main Feed` or `SubFeed` dropdown is offered), submit a unique link, assert the truthful public-visibility outcome banner (`data-testid="submission-outcome-banner"`), click `data-testid="submission-outcome-item-link"` to reach `/link/[id]`, verify the link renders on `/user/e2e-newcomer?tab=links`, and verify in a separate **unauthenticated** browser context (`browser.newContext({ storageState: { cookies: [], origins: [] } })`) that `/link/[id]` and `/user/e2e-newcomer?tab=links` are publicly readable.
     2. **Newcomer post submission from standalone `/new-post` (and `/new-link` destination check)**: Using `AUTH('newcomer')`, visit `/new-post`, assert the static `Your Feed` destination summary is visible, submit a unique post, assert the public-visibility outcome banner, follow `data-testid="submission-outcome-item-link"` to `/post/[id]`, and verify in an unauthenticated browser context that `/post/[id]` and `/user/e2e-newcomer?tab=posts` are publicly readable.
     3. **Joined membership-only user vs authorised local publisher on SubFeed**: Verify that a membership-only user viewing a SubFeed where they hold no local publishing role does not see SubFeed publish controls and instead sees the explanation + link to publish to their own User Feed, whereas `AUTH('qualified')` on `qualifiedSubfeed` can publish into their own SubFeed and has no publish controls on `adminSubfeed`.
   - **Rationale**: Exercises the complete visible user interface across Home, standalone routes, SubFeed pages, and anonymous public readability without combinatorial test bloat.

#### C.26.5 Ordered Steps (`[impl]` / `[test]`)

- **Step 26.1 `[impl]` — Update `/how-it-works` and `/hur-det-funkar` publishing model and remove internal numeric thresholds**
  - **Goal**: Bring `src/app/(frontend)/how-it-works/page.tsx` and `src/app/(frontend)/hur-det-funkar/page.tsx` into full compliance with #26 AC 9 & 10.
  - **Files**: `src/app/(frontend)/how-it-works/page.tsx`, `src/app/(frontend)/hur-det-funkar/page.tsx`
  - **Exact Change Intent**:
    1. Add the "Personal-First Publishing" / "Publicering börjar i ditt eget användarflöde" card explaining public User Feed publishing, direct Main Feed promotion via engagement, and SubFeeds as earned editorial spaces rather than a mandatory promotion rung.
    2. Fix `localRoleGuides` (`Member` / `Medlem`) and the SubFeed bullets so joining alone is not described as granting SubFeed publishing rights.
    3. Remove public numeric progression/promotion threshold numbers and raw weight equations while preserving all conceptual explanations and trust level names.
  - **Proving Command**: `pnpm run typecheck && pnpm run lint`

- **Step 26.2 `[test]` — Add newcomer and local-publisher E2E journeys in `tests/playwright/e2e/progression.e2e.spec.ts`**
  - **Goal**: Verify the newcomer Home link submission, standalone `/new-post` submission, outcome navigation, independent public readability, and membership-only vs local-publisher SubFeed UI in Playwright.
  - **Files**: `tests/playwright/e2e/progression.e2e.spec.ts`, `tests/playwright/e2e/progression.setup.ts` (if an additional membership-only SubFeed relation is needed so `localmod` stays a plain member of `adminSubfeed`)
  - **Exact Change Intent**:
    1. In `progression.setup.ts`, include `newcomer.id` in `adminSubfeed.members` (Wait: `newcomer` must have **no joined SubFeeds** for the newcomer test! Instead, add `qualified.id` or `localmod.id` to `adminSubfeed.members` as a plain member with no local role in `adminSubfeed`!). That way `newcomer` has 0 joined SubFeeds, and `localmod` is a plain `member` of `adminSubfeed` (and local moderator of `qualifiedSubfeed`).
    2. In `progression.e2e.spec.ts`, add `test.describe('Personal-first publishing journeys (#26)')` testing:
       - Newcomer (`AUTH('newcomer')`, 0 joined SubFeeds) submits a unique link from Home modal -> sees `data-testid="submission-outcome-banner"` -> navigates via `data-testid="submission-outcome-item-link"` to `/link/[id]` -> anonymous context verifies `/link/[id]` and `/user/e2e-newcomer?tab=links`.
       - Newcomer (`AUTH('newcomer')`) submits a unique post on `/new-post` -> sees outcome banner -> navigates to `/post/[id]` -> anonymous context verifies `/post/[id]` and `/user/e2e-newcomer?tab=posts`.
       - Membership-only participant (`AUTH('localmod')` on `adminSubfeed`) sees the local-role publishing explanation and personal-feed link instead of SubFeed publish buttons, while `AUTH('qualified')` on `qualifiedSubfeed` sees SubFeed publish controls.
       - Visit `/how-it-works` and `/hur-det-funkar` and assert the personal-first guidance is rendered and no raw formula (`discovery x 1.6`) appears.
  - **Proving Command**:
    ```bash
    pnpm exec playwright test tests/playwright/e2e/progression.e2e.spec.ts
    ```

- **Step 26.3 `[test]` — Execute fresh isolated test database seed & repeat-run verification (with human Checkpoint 2/3 confirmation)**
  - **Goal**: Run `pnpm run seed` twice against the confirmed isolated test database and run the full targeted Vitest + Playwright verification suite.
  - **Files**: None (verification & handoff recording)
  - **Proving Command**:
    ```bash
    pnpm run seed
    pnpm run seed
    pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts tests/vitest/int/subfeed-targeting.int.spec.ts tests/vitest/int/subfeed-roles.int.spec.ts tests/vitest/int/editorial-priority-and-safety.int.spec.ts tests/vitest/int/main-feed-promotion.int.spec.ts
    pnpm exec playwright test tests/playwright/e2e/progression.e2e.spec.ts
    pnpm run typecheck
    pnpm run lint
    ```

#### C.26.6 Safeguards
- **Never claim unexecuted tests passed**: If Playwright or the isolated DB cannot start in the current environment, report the exact error output and stop.
- **Keep `newcomer` in `progression.setup.ts` with 0 joined SubFeeds**: Never add `newcomer.id` to any SubFeed's `members` array in `progression.setup.ts`.
- **Do not weaken safety or promotion rules for tests**: Verify pending/blocked states via the integration suite in #25 and existing quarantine E2E test in `progression.e2e.spec.ts`.

#### C.26.7 Verification Commands
```bash
pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts tests/vitest/int/subfeed-targeting.int.spec.ts tests/vitest/int/subfeed-roles.int.spec.ts tests/vitest/int/editorial-priority-and-safety.int.spec.ts tests/vitest/int/main-feed-promotion.int.spec.ts
pnpm exec playwright test tests/playwright/e2e/progression.e2e.spec.ts
pnpm run typecheck
pnpm run lint
````

#### C.26.8 Definition of Done & Stop-and-Ask Triggers

- **Definition of Done**:
  - All integration specs and `tests/playwright/e2e/progression.e2e.spec.ts` pass with verbatim output recorded.
  - `/how-it-works` and `/hur-det-funkar` explain personal-first User Feed publishing, direct Main Feed promotion, and earned SubFeed local publishing roles without raw numeric formulas or private-feed claims.
  - Curated seed and repeat-run verification on the isolated test database complete with 0 duplicate rows.
  - `pnpm run typecheck` and `pnpm run lint` exit 0.
- **Stop-and-Ask Triggers**:
  - Stop before running `pnpm run seed` if the human has not yet confirmed the isolated test database target.
  - Stop at **Checkpoint 3** for final human sign-off on #22.

#### C.26.9 Self-Contained Handoff Prompt for Issue #26

````markdown
You are the implementation agent (`opencode-go/deepseek-v4.1-flash`) in `/Users/royal/www/v4`.
Your task is to implement **Issue #26: Verify newcomer publishing journeys and document the personal-first model**.

### Required Reading First

1. `AGENTS.md`
2. `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md` and `node_modules/next/dist/docs/02-pages/02-guides/testing/playwright.md`
3. `.agents/implementations/PLAN_PERSONAL_FEED_PUBLISHING.md` Section C (Issue #26)

### Locked Decisions & Exact Changes

1. **`src/app/(frontend)/how-it-works/page.tsx` & `src/app/(frontend)/hur-det-funkar/page.tsx`**:
   - Add the "Personal-First Publishing" / "Publicering börjar i ditt eget användarflöde" section.
   - Update `localRoleGuides` (`Member` / `Medlem`) and SubFeed bullets so joining alone does not imply SubFeed publishing permission.
   - Remove exposed internal numeric progression/promotion threshold numbers and raw weight formulas while preserving qualitative explanations.
2. **`tests/playwright/e2e/progression.setup.ts` & `tests/playwright/e2e/progression.e2e.spec.ts`**:
   - Add `localmod.id` as a plain `member` of `adminSubfeed` in `progression.setup.ts` (keep `newcomer` in 0 SubFeeds).
   - Add `test.describe('Personal-first publishing journeys (#26)')` in `progression.e2e.spec.ts` covering newcomer Home link submission, standalone `/new-post` submission, outcome banner navigation, anonymous public readability of `/link/[id]`, `/post/[id]`, and `/user/e2e-newcomer`, membership-only SubFeed restriction vs local publisher access, and `/how-it-works` + `/hur-det-funkar` copy assertions.

### Verification

Run and report verbatim output:

```bash
pnpm exec vitest run tests/vitest/int/subfeed-eligibility.int.spec.ts tests/vitest/int/subfeed-targeting.int.spec.ts tests/vitest/int/subfeed-roles.int.spec.ts tests/vitest/int/editorial-priority-and-safety.int.spec.ts tests/vitest/int/main-feed-promotion.int.spec.ts
pnpm exec playwright test tests/playwright/e2e/progression.e2e.spec.ts
pnpm run typecheck
pnpm run lint
```
````

```

---

## D. Risk Register

| # | Risk | Why It Matters | Concrete Mitigation | Issue(s) |
| :-: | :--- | :--- | :--- | :---: |
| 1 | **Forged or absent destination (`feed: 'main'` or `feed: 'subfeed'`)** | A client can bypass form UI and invoke Server Actions, REST, or Local API directly, or omit `feed` on `Links` (where `defaultValue` was `'main'`). | Change `Links.fields.feed` `defaultValue` to `'user'`; enforce `canManageSubmittedLinks` for `'main'` and `canSubmitToSubfeed` for `'subfeed'` inside both `prepareLink`/`preparePost` (`beforeValidate`) and `submitLink`/`submitPost`. | #23, #24 |
| 2 | **Writing into another member's User Feed (`user: otherUserId`)** | An authenticated member could pass someone else's `user` ID on create or update to impersonate them on their User Feed. | In `prepareLink`, `preparePost`, and `enforceSubfeedContentTargetAccess`, reject any create/update where `req.user` is not a community moderator and `resolveID(data.user) !== resolveID(req.user.id)` with `FOREIGN_USER_FEED_UNAUTHORIZED_MESSAGE`. | #23 |
| 3 | **Membership-only SubFeed publishing surviving in code or seed** | `canSubmitToSubfeed` in `src/lib/community/subfeeds.ts:84` and `pickEligibleSubfeed` in `links.seed.ts`/`posts.seed.ts` currently allow `roles.member`. | Remove `roles.member` from `canSubmitToSubfeed` in `subfeeds.ts`; refactor `links.seed.ts` and `posts.seed.ts` to use `user` + `overrideAccess: false` and assign SubFeed items only to owners/moderators/editors/uploaders. | #23, #27 |
| 4 | **Update path bypassing creation policy** | `enforceSubfeedContentTargetAccess` (`subfeeds.ts:116`) currently returns early if `resolveID(originalDoc?.user) === req.user.id`, letting an author move their own User Feed item to `main` or `subfeed`. | Remove the self-author blanket bypass in `enforceSubfeedContentTargetAccess`; validate any change to `feed`, `subfeed`, or `user` against the same role/destination rules as creation. | #23 |
| 5 | **Feed 400s from `links.spamProbability` / `ragebaitProbability` field-level access** | Selecting moderator-only fields (`spamProbability`, `ragebaitProbability`) in public or non-moderator queries triggers Payload 400 errors in SSR (`AGENTS.md`). | Do not select or expose `spamProbability` or `ragebaitProbability` in `SubmissionOutcome`, feed queries, or UI components; derive visibility strictly from `_status`, `status`, `softDeleted`, and `quarantined`. | #23, #25 |
| 6 | **Historical drafts or pending posts silently re-published** | Changing hook logic carelessly on `update` could flip existing `draft` links or `pending` posts to `published`. | Scope immediate-publication defaults in `prepareLink` and `preparePost` strictly to `operation === 'create'` (and respect `req.query.draft` / `context.forcePending`). | #23 |
| 7 | **Seed rerun duplication & signal overwrite by `recalculateTargetSignals`** | `comments.seed.ts`, `bookmarks.seed.ts`, `discoveries.seed.ts`, and `reports.seed.ts` currently append duplicates on every run; `Votes`/`Comments` hooks overwrite `upvotes` and `featured` on target docs. | Preload natural-key lookup maps across all 9 seeders so reruns update/skip idempotently; run a deterministic post-interaction signal reconciliation pass in `seed.ts` after `seedVotes`/`seedComments`/`seedDiscoveries`. | #27 |
| 8 | **Seed hitting a shared or production database** | Running `pnpm run seed` blindly could pollute a developer's shared or production database. | Never add auto-wipe logic; enforce Human Checkpoint 2 to verify `DATABASE_URL` points to an isolated test DB before CLI `pnpm run seed` execution. | #27, #26 |
| 9 | **EN/SV copy implying privacy or guaranteed Main Feed promotion** | Calling a User Feed "private" or promising automatic promotion misleads users about visibility and ranking. | Audit all new and updated strings in `src/lib/dictionaries.ts`, `/how-it-works`, and `/hur-det-funkar` so both EN and SV explicitly call the User Feed **public** and state that engagement *can* earn Main Feed reach. | #24, #25, #26 |
| 10 | **False public-success feedback or dead links on pending/blocked/failed submissions** | Closing the modal or toasting "Published!" when an item is pending, quarantined, or rejected hides the real state and loses user input. | Drive UI completion exclusively from `SubmissionOutcome.visibility` (`published` \| `pending` \| `blocked`), hide `itemHref` when `visibility === 'blocked'`, and preserve form state with `role="alert"` on thrown errors. | #25, #26 |

---

## E. Validation Matrix

| Issue | Acceptance Criterion Summary | Automated Test / Manual Step | File Path | Status |
| :---: | :--- | :--- | :--- | :---: |
| **#23** | Ordinary member links & posts target only own User Feed (`feed: 'user'`) and are publicly readable | Vitest integration spec (anonymous + non-owner `payload.find` with `overrideAccess: false`) | `tests/vitest/int/subfeed-eligibility.int.spec.ts` | **Must write** |
| **#23** | Tampered `feed: 'main'` or `user: otherUser.id` on create or self-update is rejected | Vitest integration spec | `tests/vitest/int/subfeed-eligibility.int.spec.ts` | **Must write** |
| **#23** | Joined membership-only user is rejected when publishing link/post to SubFeed | Vitest pure + integration specs | `tests/vitest/int/subfeed-roles.int.spec.ts`, `tests/vitest/int/subfeed-targeting.int.spec.ts` | **Must update & write** |
| **#23** | Local `owner`/`moderator`/`editor`/`uploader` can publish to own SubFeed; denied on other SubFeed & Main Feed | Vitest integration spec | `tests/vitest/int/subfeed-targeting.int.spec.ts`, `tests/vitest/int/subfeed-roles.int.spec.ts` | **Must update & write** |
| **#23** | Site-wide editorial priority & quarantine/safety controls remain intact | Existing Vitest integration specs | `tests/vitest/int/editorial-priority-and-safety.int.spec.ts`, `tests/vitest/int/main-feed-promotion.int.spec.ts` | Existing (must pass) |
| **#27** | Curated 8-persona, 3-SubFeed community with coherent copy, post-hook roles, and promoted/unpromoted/safety examples | Vitest integration spec + isolated fresh-DB CLI run | `tests/vitest/int/subfeed-eligibility.int.spec.ts`, `src/scripts/seed/seed.ts` | **Must write** + Manual CLI at Checkpoint 2 |
| **#27** | Second seed run creates 0 duplicate records across all 9 collections and preserves unrelated user data | Vitest double-run integration spec + CLI rerun | `tests/vitest/int/subfeed-eligibility.int.spec.ts` | **Must write** + Manual CLI at Checkpoint 2 |
| **#24** | `getPublishingDestinationEligibility` returns `'user'` default and hides unauthorized destinations | Vitest unit spec | `tests/vitest/int/subfeed-roles.int.spec.ts` | **Must write** |
| **#24** | Home shows `Add to your feed` actions for newcomer with 0 joined SubFeeds; forms show static `Your Feed` summary | Playwright E2E spec | `tests/playwright/e2e/progression.e2e.spec.ts` | **Must write** |
| **#25** | `SubmissionOutcome` accurately reports `published`, `pending`, and `blocked` states and gates `itemHref` | Vitest integration spec | `tests/vitest/int/subfeed-eligibility.int.spec.ts` | **Must write** |
| **#25** | Home modal & standalone forms show outcome banner with clickable `/link/[id]` & `/post/[id]` and preserve input on error | Playwright E2E spec | `tests/playwright/e2e/progression.e2e.spec.ts` | **Must write** |
| **#26** | Newcomer submits link from Home and post from `/new-post`, reaches item, and anonymous viewer can read both | Playwright E2E spec | `tests/playwright/e2e/progression.e2e.spec.ts` | **Must write** |
| **#26** | `/how-it-works` and `/hur-det-funkar` explain personal-first model without raw numeric formulas or private-feed claims | Playwright E2E assertion + code review | `src/app/(frontend)/how-it-works/page.tsx`, `src/app/(frontend)/hur-det-funkar/page.tsx`, `tests/playwright/e2e/progression.e2e.spec.ts` | **Must write** |

---

## F. Open Questions for the Human

1. **Isolated Test Database Target for #27 / #26 CLI Seed Verification (Checkpoint 2)**:
   - **Ambiguity**: Running `pnpm run seed` via CLI mutates whatever database `DATABASE_URL` in `.env` points to.
   - **Proposed Default**: Keep all automated seed/rerun tests in Vitest (`tests/test.env`), and pause at **Checkpoint 2** before invoking `pnpm run seed` in the shell so you can confirm `DATABASE_URL` points to an isolated fresh test database.
2. **Legacy Core Emails (`admin@mail.com`, `moderator@mail.com`, `editor@mail.com`) vs Reserved `@example.com` Domains in #27**:
   - **Ambiguity**: Existing `users.seed.ts` seeded `admin@mail.com`, `moderator@mail.com`, and `editor@mail.com`, while #27 AC 2 requires reserved example domains (`.example` / `@example.com`) for all seeded fictional contact details. (`tests/vitest/utils/test-user.ts` and `tests/playwright/e2e/global.setup.ts` already self-create `admin@mail.com` if absent.)
   - **Proposed Default**: Use `@example.com` for all 8 curated seed personas in `users.seed.ts` (`alva@example.com` as admin, `kalle@example.com` as moderator, `freja@example.com` as editor, etc.) to strictly satisfy #27 AC 2, while leaving test-harness helpers in `tests/` untouched.

---

## G. Out of Scope (Condensed)

- Redesigning the `/user/[username]` profile layout, tabs, or global User Feed discovery/navigation.
- Changing feed-count queries, Home feed mixing (`?mixSubfeeds=true`), or merging Home links and `/wall` posts into a single feed.
- Adding private/followers-only User Feed visibility toggles.
- Modifying standing formulas (`reputation.ts`), promotion thresholds (`promotion.ts`), editorial priority duration/boost (`ranking.ts`), or SubFeed creation candidacy gates (`subfeedEligibility.ts`).
- Retroactively publishing existing `draft` links or `pending` posts already in the database.
- Adding automatic database wipe/reset scripts or external scraping/AI calls to `pnpm run seed`.
```
