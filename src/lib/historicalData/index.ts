import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const HISTORICAL_DATA_PATH = path.resolve(__dirname, '../../../existenz-links.json')

export interface HistoricalLink {
  title: string
  src: string
  type: string
  nsfw: boolean
}

export interface HistoricalDay {
  date: string
  links: HistoricalLink[]
}

let cachedData: HistoricalDay[] | null = null

export function loadHistoricalData(): HistoricalDay[] {
  if (cachedData) return cachedData

  if (!fs.existsSync(HISTORICAL_DATA_PATH)) {
    return []
  }

  try {
    const content = fs.readFileSync(HISTORICAL_DATA_PATH, 'utf-8')
    const parsed = JSON.parse(content)
    if (!Array.isArray(parsed)) {
      console.error('Historical data is not an array')
      return []
    }
    cachedData = parsed
    return cachedData
  } catch (error) {
    console.error('Failed to load historical data:', error)
    return []
  }
}

export function getHistoricalUrls(): Set<string> {
  const data = loadHistoricalData()
  const urls = new Set<string>()
  for (const day of data) {
    for (const link of day.links) {
      if (link.src) urls.add(link.src)
    }
  }
  return urls
}

export function getHistoricalYoutubeIds(): Set<string> {
  const data = loadHistoricalData()
  const ids = new Set<string>()
  for (const day of data) {
    for (const link of day.links) {
      if (link.type === 'youtube' && link.src) {
        ids.add(link.src)
      }
    }
  }
  return ids
}
