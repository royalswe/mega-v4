# Improvements Roadmap

This file tracks refactors and product improvements for the project.
We will implement these step by step.

## Goals

- Improve maintainability and type safety.
- Reduce duplicate UI logic.
- Improve accessibility and interaction quality.
- Add one differentiated product experience to make the app feel less generic.

## Priority Summary

1. Replace `any` and tighten data types in user-facing flows.
2. Introduce a reusable modal primitive and migrate custom modal logic.
3. Reduce duplication between link/post submission flows.
4. Housekeeping: TS config deprecation and Tailwind canonical class cleanup.
5. Add one product feature that increases distinctiveness.

## Step-by-Step Plan

### Step 1: Type Safety Foundation (High)

Scope:

- Replace `dict: Record<string, any>` with inferred dictionary type from `getDictionary`.
- Remove `as any` in reports/moderation paths where practical.
- Add small helper types for relationship objects in moderation/reporting.

Target files (initial batch):

- `src/components/subfeeds/SubfeedCreatePanel.tsx`
- `src/components/links/LinkSubmitForm.tsx`
- `src/components/posts/PostSubmitForm.tsx`
- `src/app/(frontend)/moderation/page.tsx`
- `src/app/actions/reports.ts`

Acceptance criteria:

- No new lint warnings in modified files.
- No `any` in modified signatures unless justified with comment.
- `pnpm run typecheck` passes.

### Step 2: Reusable Modal Primitive (High)

Scope:

- Build `src/components/ui/modal.tsx` using Radix Dialog best practices.
- Migrate `SubfeedCreatePanel` to use modal primitive.
- Ensure focus trap, ESC close, overlay close, and focus return are handled.

Target files:

- `src/components/ui/modal.tsx`
- `src/components/subfeeds/SubfeedCreatePanel.tsx`

Acceptance criteria:

- Keyboard navigation works end to end.
- Modal behavior is consistent and reusable.
- Existing open/close animation quality is preserved or improved.

### Step 3: Form Duplication Reduction (High)

Scope:

- Extract shared destination/subfeed/nsfw action-row patterns from:
  - `LinkSubmitForm`
  - `PostSubmitForm`
- Keep schema-specific logic separate, share only reusable UI+flow parts.

Candidate shared components:

- `SubmissionDestinationFields`
- `SubmissionActionRow`

Acceptance criteria:

- Reduced duplicate code between link/post forms.
- Behavior parity maintained.
- Existing tests or manual checks pass.

### Step 4: Config and UI Housekeeping (Medium)

Scope:

- TS config deprecation follow-up:
  - handle `baseUrl` deprecation warning path.
- Tailwind class canonicalization in shared UI select component.

Target files:

- `tsconfig.json`
- `src/components/ui/select.tsx`

Acceptance criteria:

- Cleaner diagnostics output.
- No behavior change.

### Step 5: Product Differentiator (Medium)

Option A (recommended first): **Subfeed Pulse Header**

Description:

- Add a compact subfeed header module showing:
  - top trending topics
  - 24h activity delta
  - new posts/links count

Why first:

- High visual impact with moderate implementation scope.
- Reuses existing subfeed and ranking data.

Acceptance criteria:

- Appears on subfeed detail page.
- Works on mobile and desktop.
- No major layout regressions.

## Suggested Execution Order

1. Step 1 (type safety) in a narrow first batch.
2. Step 2 (modal primitive + migration).
3. Step 3 (form shared components).
4. Step 4 (housekeeping cleanup).
5. Step 5 (Subfeed Pulse Header).

## Working Notes

- Keep each step in its own commit for easy rollback and review.
- Prefer small diffs over broad refactors.
- Run `pnpm run typecheck` after each step.
- Run `pnpm run lint` before finalizing each step.

---

## Review Findings (2026-05-30)

A codebase review surfaced the following items beyond the existing roadmap.
Smaller wins (dead-code removal, dynamic-import cleanup) were applied directly;
the items below need design decisions before implementation.

### Security / Authorization

#### Media collection: open update/delete (resolved)

Fixed: added `uploadedBy` relationship + row-level access (owner or
admin/moderator) in `src/collections/Media/index.ts`. Set automatically in
`beforeChange` on create. Migration `20260530_214358_media_uploaded_by`
adds the column + FK + index. The field is admin-readonly and field-level
write is restricted to moderators+ to prevent ownership tampering.

Follow-up: a backfill script could assign `uploadedBy` for orphaned rows
created before the migration; currently they remain nullable and only
moderators can edit them.

#### Click tracking writes from unauthenticated callers (resolved)

Fixed: removed the manual `links.clickCount` increment from
`src/app/actions/trackClick.ts` and moved it into a `LinkClicks`
`afterChange` hook. The trusted write now lives inside the collection
hook (server-controlled), and the action only inserts the click row.

Follow-up: basic rate limiting (per fingerprint / IP) is still worth
adding at the action boundary.

### Performance

Several feed/aggregation pages still fetch up to 1000 rows or disable
pagination, then aggregate in memory. `select` clauses were added to the
worst offenders below to reduce wire data:

- `src/app/(frontend)/page.tsx` (~L159) — bookmarks (limit 1000, `select: { link: true }`).
- `src/app/(frontend)/wall/page.tsx` (~L44) — bookmarks (limit 1000, `select: { post: true }`).
- `src/app/(frontend)/subfeeds/page.tsx` (~L129, ~L160) — links/posts (limit 1000, `select: { subfeed: true }`).

Still open:

- `src/app/(frontend)/submitted/page.tsx` (~L85) — `pagination: false`; needs server pagination.
- `src/app/(frontend)/subfeeds/[slug]/page.tsx` (~L287, L317, L357, L392) — multiple `limit: 0` count queries per render; could be consolidated into a SQL view or denormalized counters.
- `depth: 2` queries in `moderation/`, `post/[id]/`, `link/[id]/`, `user/[username]/` pages — most only need a couple of relation fields.

### Duplicate Logic (extends Step 3 in roadmap)

Beyond the link/post submission forms already on the roadmap, these pairs
duplicate flow logic and should likely share a generic per-target helper:

- Voting actions: `src/app/actions/links.ts` `toggleVote` and
  `src/app/actions/posts.ts` `togglePostVote`.
- Bookmarking: `src/app/actions/links.ts` and `src/app/actions/posts.ts`.
- UI: `src/components/links/VoteButtons.tsx` ↔
  `src/components/posts/VoteButtons.tsx`;
  `src/components/links/BookmarkButton.tsx` ↔
  `src/components/posts/BookmarkButton.tsx`.
- Data: `src/app/(frontend)/data/getInteractions.ts` ↔
  `getPostInteractions.ts`.

A `useInteraction<'link' | 'post'>(targetId, kind)` style abstraction or a
`createInteractionActions(collection)` factory would prevent further drift.

### Type Safety Hotspots (extends Step 1 in roadmap)

Resolved in this pass:

- `src/collections/Links/index.ts`, `src/collections/Posts/index.ts`,
  `src/collections/Comments/index.ts`: replaced `as any` on access filter
  return values with `as Where` (imported from `payload`).
- `src/components/comments/CommentForm.tsx`: `dict: Record<string, any>` →
  `dict: AppDictionary`.

Still open:

- `src/collections/Votes/index.ts` (~L38): `where` typed as `any`.
- `src/collections/Votes/hooks/recalculateVotes.ts` (~L199): `catch (e: any)`.
- `src/lib/community/contentSignals.ts` (~L59, L155): `targetDoc` cast to
  `any` and a final `update` call cast to `any` — both stem from the same
  dynamic `targetCollection` ('links' | 'posts' | 'comments') design.
- `dict: Record<string, any>` props still in `RegisterForm`,
  `ProfileSettings` — same `AppDictionary` swap applies.

### Minor (applied in this pass)

- Removed dead duplicate file `src/app/actions/submitLink.ts` (canonical
  version lives in `src/app/actions/links.ts`, used by `LinkSubmitForm`).
- Replaced dynamic `import('@/app/actions/comments')` in
  `src/components/comments/CommentForm.tsx` with a static import of
  `submitPostComment` and removed the stale "will need to create" comment.
