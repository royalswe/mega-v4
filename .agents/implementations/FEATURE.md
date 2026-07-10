# EXISTENZ NEXT — COMMUNITY ENGINE SPEC

## Payload CMS Architecture & Copilot Implementation Guide

---

# PROJECT GOAL

Transform this current simple Existenz-style link site into a dynamic community-driven platform with:

- Main Feed
- User Feeds
- Sub Feeds
- Dynamic reputation
- Community discovery system
- Soft gamification
- Organic role progression
- Human + algorithmic moderation

The platform should feel like:

- old-school internet forums
- Reddit
- Hacker News
- MMO reputation systems
- imageboard culture
- curated internet culture

WITHOUT becoming:

- a social credit system
- TikTok dopamine sludge
- overmoderated corporate social media

Core principle:

> Community culture first.
> Gamification second.

---

# IMPORTANT DESIGN PRINCIPLES

## DO NOT:

- show exact reputation numbers publicly
- publicly shame users
- allow mob moderation
- create infinite engagement loops
- over-engineer scoring visibly
- expose internal ranking formulas

---

## DO:

- reward discovery
- reward quality contribution
- reward consistency
- encourage niche communities
- keep moderation human-centered
- make systems feel organic

---

# CORE FEEDS

---

# 1. MAIN FEED

Main public feed.

Contains:

- editor posts
- uploader posts
- trending community posts
- promoted sub-feed content
- breaking content

Sorting:
Hybrid ranking based on:

- freshness
- engagement velocity
- unique interactions
- discovery momentum
- trust weighting

NOT purely chronological.

---

# 2. USER FEEDS

Every user has:

- profile
- personal feed
- uploads
- posts
- comments
- discoveries

User posts can organically rise into Main Feed.

This is critical.

Main Feed should discover users.
Not only staff content.

---

# 3. SUB FEEDS

Community-created niche feeds.

Examples:

- Tech
- Memes
- AI
- Conspiracies
- Music
- Gaming
- NSFW
- Retro Internet

Sub Feeds have:

- members
- moderators
- identity
- themes
- feed rules

Sub Feeds can promote content into Main Feed.

---

# DATABASE MODELS

---

# USERS

Fields:

```ts
{
  username
  email
  avatar
  bio

  trustLevel
  titles[]
  badges[]

  reputationHidden
  reputationPublicLabel

  securityScore

  isUploader
  isEditor
  isModerator
  isAdmin

  streakDays

  lastActiveAt

  discoveryScore
  contributionScore
  interactionScore
  moderationScore

  legacyContributionScore

  createdAt
}
```

# POSTS

{
title
slug
content

type: - link - article - image - video - discussion

author

feed: - main - user - subfeed

subfeed

tags[]

score
controversyScore
discoveryMomentum

upvotes
downvotes
commentsCount
sharesCount

featured
breaking
controversial

status: - published - pending - removed

createdAt
}

# COMMENTS

{
content
author
post

score
controversyScore

parentComment

createdAt
}

# DISCOVERIES

{
user
post

discoveredAt

engagementGenerated
}

# SUBFEEDS

{
name
slug
description

avatar
banner

rules

moderators[]
members[]

reputation

featured

createdAt
}

# REPORTS

{
reporter
targetType
targetId

reason

status: - pending - approved - rejected

reviewedBy
}

---

## REPUTATION SYSTEM

IMPORTANT:
Public users should NEVER see raw scores.

Internally store numbers.
Publicly expose labels only.

## TRUST LEVELS

Example:

Newcomer
Regular
Recognized
Trusted
Veteran
Curator
Pillar
Legend

These are calculated dynamically.

## DISCOVERY SYSTEM (MOST IMPORTANT FEATURE)

Users gain Discovery Score when:

interacting early with posts that later trend
reviving old content that becomes popular
surfacing niche content before others

This is the heart of the platform.

The site should reward:

taste
timing
curation

NOT only creation.

## CONTENT RANKING ALGORITHM

DO NOT USE SIMPLE LIKE COUNTS.

Use weighted ranking:

ranking =
freshness

- engagement velocity
- unique commenters
- trusted user interactions
- discovery momentum

* spam probability
* ragebait probability

Need anti-gaming systems.

## TITLES SYSTEM

Titles are:

temporary
fun
behavioral

Never punitive.

GOOD:

Night Owl
Archivist
Deep Diver
Trend Hunter
Chaos Engine
Reply Guy
Meme Priest
Signal Booster

BAD:

Crybaby
Troll
Loser
Buzzkill

Titles should feel like internet culture lore.

## MODERATION SYSTEM

Human moderation ALWAYS overrides algorithms.

Community moderation should:

assist
not control

## REPORT FLOW

Users can:

report spam
report abuse
report broken links

Trusted users:

fast-track reports
collapse suspicious content temporarily

BUT:
users must NEVER hard-delete content automatically.

## ANTI-SPAM SYSTEMS

Need:

rate limiting
duplicate detection
similarity detection
vote abuse detection
brigading detection

Examples:

repeated comments
mass downvoting
invite farming
interaction loops
BREAKING CONTENT SYSTEM

Content can become:

trending
featured
breaking

Automatically based on:

acceleration
interaction velocity
cross-feed engagement

Editors can manually override.

## FEED PHILOSOPHY

Main Feed should feel:

alive
chaotic
human
internet-native

NOT:

sanitized corporate social media

The goal is:
"interesting internet"

not:
"maximum engagement"

## UI/UX PRINCIPLES

Design goals:

dark mode first
dense information
fast browsing
minimal friction
keyboard friendly
old internet feeling
modern responsiveness

Think:

Reddit old + modern
Hacker News
4chan catalog
Discord compact mode

## IMPORTANT PRODUCT PHILOSOPHY

The platform should create:

recognizable personalities
community lore
recurring characters
niche cultures
inside jokes
internet archaeology

The platform should NOT optimize for:

addiction
outrage
vanity metrics

---

## IMPLEMENTATION PHASES

## PHASE 1 — FOUNDATION

Implement:

Users
Posts
Comments
Votes
Main Feed
User Profiles

## PHASE 2 — DISCOVERY ENGINE

Implement:

discovery scoring
trending calculations
feed ranking
hidden trust system

## PHASE 3 — SUB FEEDS

Implement:

niche communities
subfeed moderation
subfeed feeds

## PHASE 4 — TITLES & REPUTATION

Implement:

dynamic labels
behavioral titles
trust progression

## PHASE 5 — ADVANCED MODERATION

Implement:

report systems
anti-spam
anti-brigading
trust-weighted moderation

## PAYLOAD CMS NOTES

Use:

collections for core models
hooks for scoring
access control for moderation
custom endpoints for ranking
cron jobs for recalculation

Avoid:

heavy calculations in frontend
public exposure of scoring logic
FINAL PRODUCT VISION

A platform that feels like:

a living internet organism
a competitive culture engine
a digital underground newspaper
an evolving community MMORPG

NOT:

another generic social media clone.
