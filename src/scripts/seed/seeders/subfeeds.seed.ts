import type { Payload } from 'payload'

import { chance, pickOne, slugify } from './utils.seed'

const subfeedBlueprints = [
  {
    name: 'Indie Web Builders',
    description: 'People building small, useful products and sharing lessons from the journey.',
    rules:
      'Keep feedback practical. Share what worked and what failed. No spam, no growth-hacking bait.',
    theme: 'minimal',
  },
  {
    name: 'Deep Reading Club',
    description: 'Longform essays, thoughtful takes, and summaries worth discussing.',
    rules: 'Link sources, summarize key arguments, and critique ideas not people.',
    theme: 'editorial',
  },
  {
    name: 'Design Systems Lab',
    description: 'Patterns, components, accessibility and design tokens in the real world.',
    rules: 'When posting critiques, include alternatives and implementation details.',
    theme: 'craft',
  },
  {
    name: 'Open Source Dispatch',
    description: 'Interesting OSS launches, roadmaps, and governance discussions.',
    rules: 'Disclose if you are affiliated with the project you are posting about.',
    theme: 'community',
  },
  {
    name: 'AI Product Signals',
    description: 'Evidence-driven conversations about shipping AI features that users keep.',
    rules: 'Prioritize user outcomes over hype. Include concrete metrics when possible.',
    theme: 'research',
  },
]

export async function seedSubfeeds(payload: Payload) {
  const [{ docs: users }, { docs: existingSubfeeds }] = await Promise.all([
    payload.find({
      collection: 'users',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'subfeeds',
      limit: 500,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  if (users.length === 0) {
    console.log('Skipping subfeed seed: no users available')
    return
  }

  const moderatorCandidates = users.filter((user) =>
    Array.isArray(user.roles)
      ? user.roles.some((role) => role === 'admin' || role === 'moderator' || role === 'editor')
      : false,
  )
  const existingSlugs = new Set(existingSubfeeds.map((subfeed) => subfeed.slug))

  let created = 0

  for (const blueprint of subfeedBlueprints) {
    const slug = slugify(blueprint.name)

    if (existingSlugs.has(slug)) {
      continue
    }

    const moderator = pickOne(moderatorCandidates.length > 0 ? moderatorCandidates : users)
    const members = users
      .filter(() => chance(0.35))
      .slice(0, 20)
      .map((member) => member.id)

    const uniqueMembers = Array.from(new Set([moderator.id, ...members]))
    await payload.create({
      collection: 'subfeeds',
      data: {
        name: blueprint.name,
        slug,
        description: blueprint.description,
        rules: blueprint.rules,
        theme: blueprint.theme,
        moderators: [moderator.id],
        members: uniqueMembers,
        featured: chance(0.3),
      },
      overrideAccess: true,
    })

    existingSlugs.add(slug)
    created += 1
  }

  console.log(`Seeded subfeeds: ${created}`)
}
