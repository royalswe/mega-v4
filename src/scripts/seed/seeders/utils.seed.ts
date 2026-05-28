import { faker } from '@faker-js/faker'

export const pickOne = <T>(items: T[]): T => {
  return items[Math.floor(Math.random() * items.length)]
}

export const chance = (threshold: number): boolean => {
  return Math.random() < threshold
}

export const randomInt = (min: number, max: number): number => {
  return faker.number.int({ min, max })
}

export const asLexicalRichText = (text: string) => {
  return {
    root: {
      children: [
        {
          children: [
            {
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
              type: 'text',
              version: 1,
            },
          ],
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          type: 'paragraph',
          version: 1,
        },
      ],
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      type: 'root',
      version: 1,
    },
  }
}

export const randomRecentDateISO = (maxDaysAgo = 45): string => {
  const daysAgo = faker.number.int({ min: 0, max: maxDaysAgo })
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

export const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
