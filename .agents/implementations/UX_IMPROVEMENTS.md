# UI/UX Improvement Specification: Existenz V4

This document outlines structural and design improvements for the Existenz V4 link-sharing platform, focused on information density, interaction design, community-authenticity signals, and accessibility. Each item includes a priority (P0 = fixes a trust/credibility problem, P1 = engagement improvement, P2 = polish) and acceptance criteria so implementation can be verified without guessing at intent.

## 1. Trust & Authenticity Signals (P0)

The platform currently reads as low-activity/automated to a new visitor, which undermines everything else. Fix this first — no amount of layout polish matters if the content looks like an ad farm.

- **Suppress zero-value stats instead of displaying them.** "Trending now 0," "Fresh discussions 0," "Reputation: 0," and "1 members" all currently render literally. A visible zero reads as "broken" or "dead," not "new." Hide the stat entirely below a minimum threshold (e.g. don't show a trending count until it's ≥ 5, don't show "Reputation" until a subfeed has earned any), or replace with qualitative copy ("New," "Just started") until real numbers exist.
  - _Acceptance criteria:_ No stat block anywhere in the app renders the literal value `0` to an end user; each has a defined fallback state.

## 2. Navigation and Discovery (SubFeeds) (P1)

The current SubFeeds directory shows near-identical cards (same member count, same "Quiet today" status, same "Log in to join" CTA repeated 3+ times on one screen) — this is the biggest single contributor to the "ad UI" feel reported. Fixing §0's zero-value suppression is a prerequisite here.

- **Horizontal Scrolling Chips:** Add a horizontal-scroll row of "Trending SubFeeds" to the homepage, so SubFeeds is discoverable without a full page navigation.
- **Preview Widget ("SubFeed Spotlight"):** Add a sidebar widget showing SubFeed name, an activity indicator (only once §0's fallback logic is in place — do not show "Quiet today" for every single card), and a Join/Follow button.
- **CTA reduction:** Do not repeat "Log in to join" identically on every card _and_ show a separate global "Log in" button _and_ a page-level "Log in to create" button in the same viewport. Pick one primary login CTA per page and make card-level CTAs a lighter-weight affordance (e.g. an outlined "Join" button that triggers the login modal, rather than a full repeated text link).
  - _Acceptance criteria:_ No single viewport contains more than 2 distinct "Log in" text CTAs.

## 3. Feed and State Optimization (P1)

- **Max-Width Container:** Apply `max-width: 900px` (or the project's design-system equivalent) to the main content column, to prevent excessive line length on desktop.
- **Empty States:** Replace passive/placeholder text for anonymous or empty-feed users with actionable prompts:
  - Anonymous + empty trending: "See what everyone is discussing" → link to global trending.
  - Logged in + no subscriptions: "Start by following these popular communities" → inline list of 3 suggested subfeeds (pull from the same "Trending SubFeeds" data as §2).
- **Focus Management:** Switching between "Best," "New," and "Rising" must update the list via client-side state, not a full page reload, and must preserve keyboard focus and not disrupt screen-reader flow.
  - _Acceptance criteria:_ Tab switch does not trigger a network-level page navigation (verify via dev tools), and focus remains on the selected tab control after content updates.

## 4. Interaction & Feedback — Logged-In Context (P1)

- **Personalized Signals:** Replace the current "Log in for your personalized subfeed signal" placeholder with a live widget showing the logged-in user's top 3 subscribed feeds and their recent activity.
- **Optimistic UI:** Votes and comment submissions should update the visible count immediately on click, then reconcile silently with the API response (roll back with a subtle error state if the request fails).
  - _Acceptance criteria:_ Vote count updates within one animation frame of the click, with no visible loading spinner for the common case.
- **Account Context:** Once authenticated, replace the generic header "Log in" button with a "Dashboard" or "My Feed" link plus an account menu (avatar, settings, logout) — do not leave a stale "Log in / Sign up" pair visible to a signed-in user.

## 5. Accessibility (WCAG / IBM Standards)

- **Heading Hierarchy:** Audit that `h2` elements used for "Approved Links" and sidebar widget titles are properly and consistently nested (no skipped levels, no duplicate `h1`s).
- **Landmark Elements:** Use semantic `<nav>`, `<main>`, and `<aside>` tags. Mark the "Best / New / Rising" filter as `role="tablist"` with each option as `role="tab"`, since it behaves as a dynamic content filter, and wire up `aria-selected` state correctly.
  - _Acceptance criteria:_ Automated accessibility scan (e.g. axe-core) reports no landmark or heading-order violations on the homepage and subfeeds page.

## Priority Summary

| Priority | Focus                                                                                           |
| -------- | ----------------------------------------------------------------------------------------------- |
| P0       | Trust/authenticity signals — zero-stat suppression, auto-agent labeling, source diversification |
| P1       | SubFeed discovery redesign, link card refactor, feed state handling, logged-in personalization  |
| P2       | Accessibility hardening, visual polish                                                          |

---

_Developed for: Existenz V4_
_Focus: Trust & Authenticity, Information Density, Engagement, Accessibility_
