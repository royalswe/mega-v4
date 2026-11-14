import { describe, expect, it } from 'vitest'
import type { SerializedLexicalNode } from 'lexical'

import { lexicalStateToMarkdown, markdownToLexicalState } from '@/lib/richTextMarkdown'

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
})
