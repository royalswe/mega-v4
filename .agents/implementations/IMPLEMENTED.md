# Implemented Today

This file summarizes what is already implemented in the current repo from the community-engine / BOBHUND-inspired feature set.

## Feeds

- Main feed exists and mixes `feed=main` content with promoted subfeed content.
- User feeds exist as part of the profile/content model.
- Subfeeds exist as first-class community spaces with membership and moderator lists.
- Users can opt into mixing joined subfeeds into the main feed view.

## Reputation and Titles

- Users have hidden reputation plus a public reputation label.
- Trust levels are derived from weighted point-class signals.
- Explicit point classes now exist for interaction, likability, contribution, cleaning, discovery, recruiter, legacy contribution, and security.
- Behavioral titles are derived from activity patterns such as discovery, contribution, interaction, moderation, and streaks.
- User records store discovery, contribution, interaction, moderation, legacy contribution, and security score fields.
- Votes, comments, reports, and subfeed member growth now feed those point classes.

## Roles and Access

- The repo has role flags for `user`, `uploader`, `editor`, `moderator`, and `admin`.
- The repo now also stores derived `cleaner` and `recruiter` roles.
- Subfeeds support creator auto-membership and auto-moderator assignment on create.
- Subfeed management is restricted through access rules and membership checks.
- Automatic role progression/demotion now derives uploader/editor/moderator access from user score signals.
- Admin stays manual and is preserved explicitly.

## Ranking and Content Signals

- Links and posts are recalculated from votes, comments, trusted interactions, and discovery signals.
- Content can be marked `featured`, `breaking`, and `controversial` from ranking logic.
- The main feed and subfeed promotion logic uses ranking thresholds and controversy filtering.

## Discovery and Community Growth

- Discovery momentum is tracked for posts and links.
- User activity is incremented through score signals and streak tracking.
- The platform already has the data model needed for discovery-focused curation.

## Documentation and UX

- A `How it works` page documents the current trust levels, roles, feed ranking, and subfeed behavior.
- The roadmap docs already call out product and UX improvements for feed polish, modals, and distinctiveness.

## Still Missing From the Full BOBHUND Vision

- Recruiter/sub-redaction score sharing.
- Admin candidacy and voting rules.
- First-class breaking news / announcement editorial workflows.
- Public TMV display as a visible social metric.

## Completion Checklist

### 1. Cleaner Workflow

- [x] Hide reported content immediately for cleaner-tracked reports.
- [x] Add moderator review queue and restore/keep-hidden decisions.
- [x] Apply positive/negative cleaning deltas from review outcomes.

### 2. Recruiter / Sub-Redaction Loop

- [ ] Split recruiter rewards across subfeed members/moderators.
- [ ] Tie recruiter bonuses to sustained subfeed growth and quality.
- [ ] Add a visible sub-redaction summary on subfeed pages (without duplicating member stats).

### 3. Admin Progression Rules

- [ ] Add admin candidacy flow gated behind moderator status and high TMV.
- [ ] Add unanimous admin vote requirement for promotion.
- [ ] Prevent automatic downgrade for admin accounts.

### 4. Editorial Content Types

- [ ] Add first-class breaking news and announcement content workflows.
- [ ] Extend feed logic so editor/admin content can be pinned or surfaced separately.
- [ ] Add richer handling for controversial breaking content.

### 5. Public Reputation Surface

- [ ] Decide whether to expose TMV publicly or keep it hidden.
- [ ] If shown, add a careful display format for profile and comment cards.
- [ ] If hidden, keep the current public label and title system as the visible layer.
