import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'
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
  "score": number (1-10),
  "title": "Generated Swedish Title",
  "nsfw": boolean,
  "reason": "short explanation in English"
}`

async function rankWithOpenAI(batch: Candidate[], examples: string): Promise<unknown[]> {
  if (!openai) return []
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT(examples) },
        {
          role: 'user',
          content: JSON.stringify(
            batch.map((c) => ({ title: c.title, source: c.source, type: c.type })),
          ),
        },
      ],
      response_format: { type: 'json_object' },
    })
    const parsed = JSON.parse(response.choices[0]?.message.content || '{"items": []}')
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch (error) {
    console.error('OpenAI Error:', error)
    return []
  }
}

async function rankWithGemini(batch: Candidate[], examples: string): Promise<unknown[]> {
  if (!genAI) return []
  try {
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3-flash-preview',
    })
    const prompt = `${SYSTEM_PROMPT(examples)}\n\nInput items:\n${JSON.stringify(batch.map((c) => ({ title: c.title, source: c.source, type: c.type })))}`

    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // Gemini sometimes wraps JSON in markdown blocks
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const jsonString = jsonMatch ? jsonMatch[0] : text

    const parsed = JSON.parse(jsonString)
    return Array.isArray(parsed.items) ? parsed.items : []
  } catch (error: any) {
    if (error.status === 404) {
      console.error(
        'Gemini Error: Model not found. Try "gemini-1.5-pro" or check your API key permissions.',
      )
    } else {
      console.error('Gemini Error:', error)
    }
    return []
  }
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

  for (let i = 0; i < candidates.length; i += batchSize) {
    const batch = candidates.slice(i, i + batchSize)
    let results: unknown[] = []

    if (process.env.GEMINI_API_KEY) {
      results = await rankWithGemini(batch, examples)
    } else if (process.env.OPENAI_API_KEY) {
      results = await rankWithOpenAI(batch, examples)
    }

    if (results.length > 0) {
      if (results.length < batch.length) {
        console.warn(
          `AI returned ${results.length} results for batch of ${batch.length} candidates`,
        )
      }
      for (let j = 0; j < Math.min(batch.length, results.length); j++) {
        const res = results[j] as {
          score?: number
          title?: string
          reason?: string
          nsfw?: boolean
        }
        if (res && typeof res.score === 'number') {
          ranked.push({
            ...batch[j],
            score: res.score,
            aiTitle: res.title || batch[j].title,
            aiReason: res.reason || '',
            nsfw: typeof res.nsfw === 'boolean' ? res.nsfw : batch[j].nsfw,
          })
        }
      }
    }
  }

  return ranked.filter((r) => r.score >= 8).sort((a, b) => b.score - a.score)
}
