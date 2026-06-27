import type { Payload } from 'payload'
import type { Subfeed } from '@/payload-types'
import { faker } from '@faker-js/faker'

import { asLexicalRichText, chance, pickOne, randomInt } from './utils.seed'

type PostType = 'discussion' | 'article' | 'link' | 'image' | 'video'

type PostBlueprint = {
  type: PostType
  titlePrefix: string
  opening: string
  body: string
  closing: string
  tags: string[]
}

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const readRelationshipIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => {
      if (typeof item === 'number') return item
      if (item && typeof item === 'object' && 'id' in item) {
        const relation = item as { id?: unknown }
        return typeof relation.id === 'number' ? relation.id : null
      }
      return null
    })
    .filter((item): item is number => typeof item === 'number')
}

const postTypes: PostType[] = ['discussion', 'article', 'link', 'image', 'video']

const postBlueprints: PostBlueprint[] = [
  {
    type: 'discussion',
    titlePrefix: 'What changed after we simplified our onboarding flow',
    opening: 'We removed three steps from onboarding and watched first-session completion rise.',
    body: 'The biggest gain came from reducing cognitive load and delaying optional settings until after first value.',
    closing: 'If you have run similar experiments, what metric moved first for you?',
    tags: ['product', 'onboarding', 'ux'],
  },
  {
    type: 'article',
    titlePrefix: 'Operational lessons from a week of incident reviews',
    opening: 'Reviewing incidents in batches highlighted repeating patterns we missed day-to-day.',
    body: 'Most fixes were small process changes: clearer ownership, tighter rollback docs, and better alert thresholds.',
    closing: 'Happy to share a lightweight template if anyone wants one.',
    tags: ['ops', 'reliability', 'engineering'],
  },
  {
    type: 'link',
    titlePrefix: 'Link roundup: references that improved our implementation',
    opening:
      'Collected a handful of resources that helped unblock architecture decisions this sprint.',
    body: 'The useful ones explained trade-offs clearly and included failure modes, not just happy paths.',
    closing: 'Drop your best reference links and I will add them to the list.',
    tags: ['resources', 'learning', 'architecture'],
  },
  {
    type: 'image',
    titlePrefix: 'Visual critique request for our new card layout',
    opening: 'Shared a revised card layout focused on readability and tighter hierarchy.',
    body: 'We adjusted spacing, headline contrast, and metadata grouping to improve scan speed on mobile.',
    closing: 'What would you tweak first: typography scale, spacing rhythm, or action placement?',
    tags: ['design', 'ui', 'feedback'],
  },
  {
    type: 'video',
    titlePrefix: 'Demo recap: prototype test results and next iteration',
    opening: 'Ran a short usability demo and captured where users hesitated most.',
    body: 'Most confusion came from naming and button ordering, not from missing features.',
    closing: 'We are revising copy and interaction order next. Thoughts welcome.',
    tags: ['demo', 'research', 'iteration'],
  },
]

const pickEligibleSubfeed = (subfeeds: Subfeed[], authorId: number) => {
  const eligibleSubfeeds = subfeeds.filter((subfeed) => {
    const members = readRelationshipIds(subfeed.members)
    const moderators = readRelationshipIds(subfeed.moderators)
    return members.includes(authorId) || moderators.includes(authorId)
  })

  return eligibleSubfeeds.length > 0 && chance(0.35) ? pickOne(eligibleSubfeeds) : null
}

export async function seedPosts(payload: Payload) {
  const [{ docs: users }, { docs: subfeeds }, { docs: existingPosts }] = await Promise.all([
    payload.find({
      collection: 'users',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'subfeeds',
      limit: 200,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'posts',
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  if (users.length === 0) {
    console.log('Skipping post seed: no users available')
    return
  }

  const usedTitles = new Set(
    existingPosts
      .map((post) => post.title)
      .filter((value): value is string => typeof value === 'string'),
  )
  const usedSlugs = new Set(
    existingPosts
      .map((post) => post.slug)
      .filter((value): value is string => typeof value === 'string'),
  )

  let created = 0

  for (let i = 0; i < 45; i += 1) {
    const author = pickOne(users)
    const blueprint = pickOne(postBlueprints)
    const targetSubfeed = pickEligibleSubfeed(subfeeds, author.id)
    const feed = targetSubfeed ? 'subfeed' : chance(0.3) ? 'main' : 'user'

    const contentText = `${blueprint.opening}\n\n${blueprint.body}\n\n${blueprint.closing}`
    let title = `${blueprint.titlePrefix} ${faker.number.int({ min: 100, max: 9999 })}`
    let slug = slugify(title)

    while (usedTitles.has(title) || usedSlugs.has(slug)) {
      title = `${blueprint.titlePrefix} ${faker.number.int({ min: 100, max: 9999 })}`
      slug = slugify(title)
    }

    usedTitles.add(title)
    usedSlugs.add(slug)

    await payload.create({
      collection: 'posts',
      data: {
        title,
        content: asLexicalRichText(contentText),
        type: chance(0.8) ? blueprint.type : pickOne(postTypes),
        user: author.id,
        feed,
        subfeed: targetSubfeed ? targetSubfeed.id : undefined,
        tags: faker.helpers.arrayElements(
          [...new Set([...blueprint.tags, 'frontend', 'backend', 'ops', 'security', 'community'])],
          { min: 1, max: 3 },
        ),
        nsfw: chance(0.08),
        upvotes: randomInt(0, 250),
        downvotes: randomInt(0, 40),
        commentsCount: randomInt(0, 60),
        sharesCount: randomInt(0, 30),
        uniqueCommenters: randomInt(0, 20),
        trustedInteractions: randomInt(0, 15),
        discoveryMomentum: randomInt(0, 80),
        status: chance(0.08) ? 'removed' : chance(0.75) ? 'published' : 'pending',
      },
      draft: false,
      overrideAccess: true,
    })

    created += 1
  }

  console.log(`Seeded posts: ${created}`)
}
