import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createHash } from 'crypto'
import { loadHistoricalData } from '../historicalData'
import type { Candidate } from '../sources'

const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  : null

const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null

export interface RankedCandidate extends Candidate {
  score: number
  aiTitle: string
  aiReason: string
}

interface CandidateWithId {
  id: string
  candidate: Candidate
}

interface ProviderRankResult {
  id?: string
  score?: number
  title?: string
  nsfw?: boolean
  reason?: string
}

const SYSTEM_PROMPT = (
  examples: string,
) => `You are an editor for Existenz.se, a Swedish entertainment site. 
Your goal is to curate highly entertaining content: funny videos, freakouts, WTF moments, fails, amazing skills, animals, and viral clips.

Style guidelines for titles:
- Use Swedish
- Prefix with categories like "Svensk humor: ", "WTF: ", "Fail: ", "Djur: ", "Teknik: ", "Webm: ", "Oväntat: "
- No emojis, no ALL CAPS, no excessive clickbait.
- Max 100 characters.

Historical examples of titles:
${examples}

For each item in the input list, return a JSON object inside an "items" array with:
{
  "id": "same id from the input item",
  "score": number (1-10),
  "title": "Generated Swedish Title",
  "nsfw": boolean,
  "reason": "short explanation in English"
}`

function getCandidateStableId(candidate: Candidate): string {
  return createHash('sha1')
    .update(`${candidate.url}|${candidate.source}|${candidate.type}|${candidate.title}`)
    .digest('hex')
    .slice(0, 16)
}

async function rankWithOpenAI(
  batch: CandidateWithId[],
  examples: string,
): Promise<ProviderRankResult[]> {
  if (!openai) return []
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT(examples) },
        {
          role: 'user',
          content: JSON.stringify(
            batch.map(({ id, candidate }) => ({
              id,
              title: candidate.title,
              source: candidate.source,
              type: candidate.type,
            })),
          ),
        },
      ],
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(response.choices[0]?.message.content || '{"items": []}')
    return Array.isArray(parsed.items) ? (parsed.items as ProviderRankResult[]) : []
  } catch (error) {
    console.error('OpenAI Error:', error)
    return []
  }
}

function rankWithMock(batch: CandidateWithId[], reason: string): RankedCandidate[] {
  return batch.map(({ candidate }) => ({
    ...candidate,
    score: 8,
    aiTitle: candidate.title,
    aiReason: reason,
  }))
}

async function rankWithGemini(
  batch: CandidateWithId[],
  examples: string,
): Promise<ProviderRankResult[]> {
  if (!genAI) return []

  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
  })
  const prompt = `${SYSTEM_PROMPT(examples)}\n\nInput items:\n${JSON.stringify(batch.map(({ id, candidate }) => ({ id, title: candidate.title, source: candidate.source, type: candidate.type })))}`

  const result = await model.generateContent(prompt)
  const response = await result.response
  const text = response.text()

  // Gemini sometimes wraps JSON in markdown blocks
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  const jsonString = jsonMatch ? jsonMatch[0] : text

  const parsed = JSON.parse(jsonString)
  return Array.isArray(parsed.items) ? (parsed.items as ProviderRankResult[]) : []
}

export async function rankCandidates(candidates: Candidate[]): Promise<RankedCandidate[]> {
  if (!process.env.OPENAI_API_KEY && !process.env.GEMINI_API_KEY) {
    console.warn('No AI API keys found (OPENAI_API_KEY or GEMINI_API_KEY). Using mock ranking.')
    return candidates.map((c) => ({
      ...c,
      score: 8,
      aiTitle: c.title,
      aiReason: 'Mock ranking (no API key)',
    }))
  }

  const historicalData = loadHistoricalData().slice(0, 1)
  const examples =
    historicalData[0]?.links
      .slice(0, 10)
      .map((l) => `- ${l.title}`)
      .join('\n') || ''

  const ranked: RankedCandidate[] = []
  const batchSize = 10
  let geminiEnabled = Boolean(process.env.GEMINI_API_KEY)

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize)
    const batchWithIds = batch.map((candidate) => ({
      id: getCandidateStableId(candidate),
      candidate,
    }))

    let results: ProviderRankResult[] = []

    if (geminiEnabled) {
      try {
        results = await rankWithGemini(batchWithIds, examples)
      } catch (error: any) {
        if (error?.status === 429) {
          console.warn(
            'Gemini quota/rate limit reached. Disabling Gemini for this run and falling back.',
          )
          geminiEnabled = false
        } else if (error?.status === 404) {
          console.warn('Gemini model not found. Disabling Gemini for this run and falling back.')
          geminiEnabled = false
        } else {
          console.error('Gemini Error:', error)
        }
      }
    }

    if (results.length === 0 && process.env.OPENAI_API_KEY) {
      results = await rankWithOpenAI(batchWithIds, examples)
    }

    if (results.length === 0) {
      ranked.push(
        ...rankWithMock(batchWithIds, 'Fallback ranking (provider unavailable or rate limited)'),
      )
      continue
    }

    if (results.length < batchWithIds.length) {
      console.warn(`AI returned ${results.length} results for batch of ${batch.length} candidates`)
    }

    const batchById = new Map(batchWithIds.map((item) => [item.id, item]))
    const resolvedIds = new Set<string>()

    for (const res of results) {
      if (!res || typeof res.id !== 'string') {
        continue
      }

      const sourceItem = batchById.get(res.id)
      if (!sourceItem || resolvedIds.has(res.id) || typeof res.score !== 'number') {
        continue
      }

      const candidate = sourceItem.candidate
      ranked.push({
        ...candidate,
        score: res.score,
        aiTitle: res.title || candidate.title,
        aiReason: res.reason || '',
        nsfw: typeof res.nsfw === 'boolean' ? res.nsfw : candidate.nsfw,
      })
      resolvedIds.add(res.id)
    }

    const unresolved = batchWithIds.filter((item) => !resolvedIds.has(item.id))
    if (unresolved.length > 0) {
      ranked.push(...rankWithMock(unresolved, 'Fallback ranking (missing/invalid AI result)'))
    }
  }

  return ranked.filter((r) => r.score >= 8).sort((a, b) => b.score - a.score)
}
