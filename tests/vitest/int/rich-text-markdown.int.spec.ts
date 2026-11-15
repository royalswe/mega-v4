import { describe, expect, it, vi } from 'vitest'
import type { SerializedLexicalNode } from 'lexical'

import {
  lexicalStateToMarkdown,
  markdownToLexicalJSON,
  markdownToLexicalState,
} from '@/lib/richTextMarkdown'
import { getTestPayload } from '../utils/test-user'
import { createFeedItem, createTestUser } from './helpers'

const rootChildren = (markdown: string): SerializedLexicalNode[] =>
  markdownToLexicalState(markdown).root.children

describe('rich text markdown conversion', () => {
  it('treats a single newline as a row break inside one paragraph', () => {
    const [paragraph, ...rest] = rootChildren('First line\nSecond line') as Array<
      SerializedLexicalNode & { type: string; children?: SerializedLexicalNode[] }
    >

    expect(rest).toHaveLength(0)
    expect(paragraph.type).toBe('paragraph')
    expect(paragraph.children?.map((child) => child.type)).toEqual(['text', 'linebreak', 'text'])
  })

  it('treats a blank line as a paragraph break', () => {
    const children = rootChildren('First paragraph\n\nSecond paragraph') as Array<{
      type: string
    }>

    expect(children.map((child) => child.type)).toEqual(['paragraph', 'paragraph'])
  })

  it('converts markdown formatting only when producing Lexical state', () => {
    const [paragraph] = rootChildren('This is **bold** and *italic*') as Array<{
      children?: Array<{ type: string; format?: number; text?: string }>
    }>

    expect(paragraph.children).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ text: 'bold', format: 1 }),
        expect.objectContaining({ text: 'italic', format: 2 }),
      ]),
    )
  })

  it('round-trips serialized state back to markdown source', () => {
    const markdown = 'Hello\nworld\n\n## Heading'
    const json = JSON.stringify(markdownToLexicalState(markdown))

    expect(lexicalStateToMarkdown(json)).toContain('Hello\nworld')
    expect(lexicalStateToMarkdown(json)).toContain('## Heading')
  })

  it('falls back to the original value rather than accepting a partially parsed document', () => {
    const state = markdownToLexicalState('Keep this content')
    state.root.children.push({ type: 'unsupported-stored-node', version: 1 })
    const serialized = JSON.stringify(state)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      expect(lexicalStateToMarkdown(serialized)).toBe(serialized)
      expect(lexicalStateToMarkdown(JSON.stringify(markdownToLexicalState('Next document')))).toBe(
        'Next document',
      )
    } finally {
      error.mockRestore()
    }
  })
})

describe('rich text links in Payload rich-text fields', () => {
  it('saves a Markdown link to a comment and round-trips it back to Markdown', async () => {
    const payload = await getTestPayload()
    const user = await createTestUser(payload)
    const post = await createFeedItem(payload, { collection: 'posts', user: user.id })
    const markdown = '[link text](https://test.se)'

    const comment = await payload.create({
      collection: 'comments',
      data: { post: post.id, user: user.id, comment: JSON.parse(markdownToLexicalJSON(markdown)) },
      overrideAccess: true,
    })

    expect(lexicalStateToMarkdown(JSON.stringify(comment.comment))).toBe(markdown)
  })
})
