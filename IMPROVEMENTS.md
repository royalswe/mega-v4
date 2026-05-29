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
