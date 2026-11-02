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
              detail: 0 as const,
              format: 0 as const,
              mode: 'normal' as const,
              style: '',
              text,
              type: 'text' as const,
              version: 1 as const,
            },
          ],
          direction: 'ltr' as const,
          format: '' as const,
          indent: 0,
          type: 'paragraph' as const,
          version: 1 as const,
          textFormat: 0 as const,
          textStyle: '',
        },
      ],
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      type: 'root' as const,
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
