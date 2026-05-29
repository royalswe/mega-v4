import type { Payload } from 'payload'
import { faker } from '@faker-js/faker'

import { chance, pickOne, randomInt } from './utils.seed'

type LinkType = 'article' | 'video' | 'image' | 'audio' | 'game'

type CuratedLink = {
  type: LinkType
  url: string
  title: string
  description: string
  tags: string[]
}

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

const curatedExampleLinks: CuratedLink[] = [
  {
    type: 'video',
    url: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',
    title: 'Internet History: The First YouTube Upload',
    description:
      'A short but iconic clip that marks the beginning of user-generated video culture online.',
    tags: ['video', 'internet-history', 'culture'],
  },
  {
    type: 'article',
    url: 'https://existenz.se/',
    title: 'Existenz.se: Curated Internet Finds and Daily Discovery',
    description:
      'A long-running Nordic-style curation feed with a mix of oddities, links, and cultural moments.',
    tags: ['article', 'curation', 'web'],
  },
  {
    type: 'image',
    url: 'https://www.mamp.one/wp-content/uploads/2024/09/image-resources2.jpg',
    title: 'Image Resource Example for Visual Testing',
    description:
      'A high-resolution image resource useful for previews, layout checks, and content card testing.',
    tags: ['image', 'design', 'assets'],
  },
  {
    type: 'game',
    url: 'https://www.crazygames.com/game/polytrack',
    title: 'PolyTrack: Browser Racing Game',
    description:
      'A fast-paced browser game with low friction onboarding, ideal for testing engagement patterns.',
    tags: ['game', 'browser', 'play'],
  },
  {
    type: 'audio',
    url: 'https://www.youtube.com/watch?v=lYpgHsw3M5o',
    title: 'Audio Session: Long-Form Listening Pick',
    description:
      'A music-focused link for audio category seeding and feed variety across media types.',
    tags: ['audio', 'music', 'playlist'],
  },
]

const randomLinkIdeas: Record<
  LinkType,
  { prefixes: string[]; descriptions: string[]; tags: string[] }
> = {
  article: {
    prefixes: ['Field Guide', 'Deep Dive', 'Practical Notes', 'What We Learned', 'Case Study'],
    descriptions: [
      'A practical write-up with concrete examples and trade-offs from real-world implementation.',
      'Strong context, clear argumentation, and useful references for follow-up reading.',
      'Worth discussing for teams who care about quality and long-term maintainability.',
    ],
    tags: ['article', 'engineering', 'product'],
  },
  video: {
    prefixes: ['Walkthrough', 'Build Log', 'Explainer', 'Talk Summary', 'Hands-on Demo'],
    descriptions: [
      'A concise video walkthrough that highlights key decisions without unnecessary fluff.',
      'Useful visual explanation with timestamps and practical takeaways for practitioners.',
      'Great reference to spark discussion around implementation quality and UX details.',
    ],
    tags: ['video', 'demo', 'learning'],
  },
  image: {
    prefixes: ['Visual Breakdown', 'Design Snapshot', 'Reference Board', 'Annotated Example'],
    descriptions: [
      'A visual reference with enough clarity to discuss composition, hierarchy, and usability.',
      'Helpful image resource for comparing layout choices and UI quality patterns.',
      'Good inspiration material for product teams iterating on interface details.',
    ],
    tags: ['image', 'design', 'ui'],
  },
  audio: {
    prefixes: ['Podcast Pick', 'Audio Briefing', 'Listening Notes', 'Interview Highlight'],
    descriptions: [
      'A useful listening recommendation with clear insights and practical framing.',
      'Good background audio for understanding trends, user behavior, and product strategy.',
      'Concise format that works well for async learning and team discussion.',
    ],
    tags: ['audio', 'podcast', 'insights'],
  },
  game: {
    prefixes: ['Playtest Link', 'Mechanics Spotlight', 'Interaction Study', 'Game Loop Example'],
    descriptions: [
      'A browser-playable example with interesting pacing and interaction patterns.',
      'Useful for studying engagement loops, challenge curves, and session design.',
      'A quick playable reference that can inspire feedback and iteration discussions.',
    ],
    tags: ['game', 'interaction', 'web'],
  },
}

const sharedTags = ['opensource', 'design', 'ai', 'devops', 'security', 'product', 'culture', 'web']

const pickEligibleSubfeed = (subfeeds: any[], authorId: number) => {
  const eligibleSubfeeds = subfeeds.filter((subfeed) => {
    const members = readRelationshipIds(subfeed.members)
    const moderators = readRelationshipIds(subfeed.moderators)
    return members.includes(authorId) || moderators.includes(authorId)
  })

  return eligibleSubfeeds.length > 0 && chance(0.35) ? pickOne(eligibleSubfeeds) : null
}

export async function seedLinks(payload: Payload) {
  const [{ docs: users }, { docs: subfeeds }, { docs: existingLinks }] = await Promise.all([
    payload.find({
      collection: 'users',
      limit: 1000,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'subfeeds',
      limit: 300,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: 'links',
      limit: 5000,
      depth: 0,
      overrideAccess: true,
    }),
  ])

  if (users.length === 0) {
    console.log('Skipping link seed: no users found')
    return
  }

  const types: LinkType[] = ['article', 'video', 'image', 'audio', 'game']
  const existingUrls = new Set(existingLinks.map((link) => link.url).filter(Boolean))

  let created = 0

  for (const example of curatedExampleLinks) {
    if (existingUrls.has(example.url)) {
      continue
    }

    const author = pickOne(users)
    const targetSubfeed = pickEligibleSubfeed(subfeeds, author.id)
    const feed = targetSubfeed && chance(0.2) ? 'subfeed' : 'main'

    await payload.create({
      collection: 'links',
      data: {
        title: example.title,
        url: example.url,
        description: example.description,
        type: example.type,
        user: author.id,
        feed,
        subfeed: feed === 'subfeed' ? targetSubfeed?.id : undefined,
        tags: example.tags,
        nsfw: false,
        clickCount: randomInt(20, 350),
        upvotes: randomInt(20, 260),
        downvotes: randomInt(0, 35),
        commentsCount: randomInt(2, 55),
        sharesCount: randomInt(1, 40),
        uniqueCommenters: randomInt(1, 24),
        trustedInteractions: randomInt(1, 24),
        softDeleted: false,
        _status: 'published',
      },
      draft: false,
      overrideAccess: true,
    })

    existingUrls.add(example.url)
    created += 1
  }

  const targetTotal = 50
  const remainingRandom = Math.max(0, targetTotal - created)

  for (let i = 0; i < remainingRandom; i += 1) {
    const author = pickOne(users)
    const type = pickOne(types)
    const idea = randomLinkIdeas[type]
    const targetSubfeed = pickEligibleSubfeed(subfeeds, author.id)
    const feed = targetSubfeed ? 'subfeed' : chance(0.25) ? 'user' : 'main'

    await payload.create({
      collection: 'links',
      data: {
        title: `${pickOne(idea.prefixes)}: ${faker.company.buzzPhrase()} ${faker.number.int({ min: 100, max: 999 })}`,
        url: faker.internet.url(),
        description: `${pickOne(idea.descriptions)} ${faker.helpers.arrayElement([
          'Share your take in the comments.',
          'Curious to hear alternative approaches.',
          'Useful as a reference point for future discussions.',
        ])}`,
        type,
        user: author.id,
        feed,
        subfeed: targetSubfeed ? targetSubfeed.id : undefined,
        tags: faker.helpers.arrayElements([...new Set([...idea.tags, ...sharedTags])], {
          min: 1,
          max: 3,
        }),
        nsfw: chance(0.1),
        clickCount: randomInt(0, 300),
        upvotes: randomInt(0, 220),
        downvotes: randomInt(0, 40),
        commentsCount: randomInt(0, 50),
        sharesCount: randomInt(0, 35),
        uniqueCommenters: randomInt(0, 24),
        trustedInteractions: randomInt(0, 20),
        softDeleted: chance(0.06),
        _status: 'published',
      },
      draft: false,
      overrideAccess: true,
    })

    created += 1
  }

  console.log(`Seeded links: ${created}`)
}
