# AUTOMATICALLY_ADD_LINKS

# Purpose

This repository contains a Payload CMS site inspired by Existenz.se.

The objective is to automatically add approximately 20 new links per day with minimal human involvement.

Historical examples are available in:

```text
./existenz-links.json
```

The Payload collection is located at:

```text
src/collections/Links/index.ts
```

New documents must be created according to the schema defined in that collection.

---

# Main Goal

Continuously discover entertaining videos and create new Link documents.

The site prioritizes:

- Funny videos
- Viral clips
- Public freakouts
- WTF moments
- Fails
- Swedish humor
- Technology
- Animals
- Interesting events
- Memes
- Amazing skills
- Unexpected moments

Entertainment value is more important than news value.

---

# Historical Dataset

Use:

```text
./existenz-links.json
```

as the source of truth for style.

Learn:

- title formats
- categories
- NSFW behavior
- source types
- preferred content

Avoid duplicating historical entries.

---

# Collection

The Link collection exists in:

```text
src/collections/Links/index.ts
```

Inspect the schema before creating documents.

Never assume field names.

Always follow the existing collection definition.

---

# Sources To Monitor

Preferred sources:

1. YouTube
2. Reddit
3. RSS feeds
4. Swedish news sites
5. Viral channels

Priority subreddits:

- r/PublicFreakout
- r/funny
- r/Unexpected
- r/therewasanattempt
- r/nextfuckinglevel
- r/interestingasfuck
- r/Whatcouldgowrong

---

# Daily Target

Goal:

20 new links every 24 hours.

Acceptable range:

15-25 links.

Never force low-quality content.

Quality is more important than quantity.

---

# Workflow

1. Discover candidate videos.

2. Remove duplicates.

3. Compare candidates against historical posts.

4. Score each candidate.

5. Generate title.

6. Determine source type:

- youtube
- iframe
- redirect

7. Detect NSFW.

8. Insert into Payload CMS.

---

# Duplicate Detection

Reject:

- Exact URL duplicates.
- Same YouTube video ID.
- Same embed URL.
- Highly similar titles.
- Previously existing entries.

Search both:

- database
- existenz-links.json

before inserting.

---

# Scoring

10 = exceptional

8-9 = strong

7 = acceptable

Below 7 = reject.

Factors:

- entertainment
- humor
- virality
- uniqueness
- similarity to historical posts

---

# Title Style

Titles should resemble historical posts.

Examples:

- Svensk humor: ...
- WTF: ...
- Fail: ...
- Djur: ...
- Teknik: ...
- Webm: ...

Avoid:

- excessive clickbait
- emojis
- all caps
- long titles

Maximum title length:

100 characters.

---

# NSFW Rules

Set:

```json
{
  "nsfw": true
}
```

for:

- pornography
- nudity
- explicit sexual content
- graphic violence

Otherwise:

```json
{
  "nsfw": false
}
```

---

# Automatic Approval

Insert content only when:

score >= 8

Target:

20 documents per day.

---

# Code Requirements

Prefer TypeScript.

Reuse existing utilities whenever possible.

Avoid introducing unnecessary dependencies.

Follow the repository structure.

Read existing code before making changes.

Never modify collection schemas unless required.

Do not break existing functionality.

---

# Expected Output

Create Payload documents matching the Links collection schema.

The agent should be capable of running daily and adding approximately 20 new links automatically.

Success is measured by maintaining a stream of entertaining content similar to historical Existenz.se posts.
