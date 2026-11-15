// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { RichTextDisplay } from '@/components/ui/RichTextDisplay'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { markdownToLexicalState } from '@/lib/richTextMarkdown'

afterEach(cleanup)

describe('rich text editor preview', () => {
  it.each(['Plain text', '"JSON string"', '123'])(
    'previews accepted initial text: %s',
    (initialValue) => {
      render(createElement(RichTextEditor, { initialValue, onChange: vi.fn() }))
      fireEvent.click(screen.getByRole('button', { name: 'Switch to Preview mode' }))
      expect(screen.getByText(initialValue)).toBeTruthy()
    },
  )

  it.each(['', ' \n '])('keeps empty initial values empty: %j', (initialValue) => {
    render(
      createElement(RichTextEditor, {
        initialValue,
        onChange: vi.fn(),
        placeholder: 'Empty editor',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Preview mode' }))
    expect(screen.getByText('Empty editor')).toBeTruthy()
  })

  it.each([
    ['Left', '**Right**'],
    ['`a|b`', '`<br>`'],
    ['Line one\nLine two', 'a\\\\b | c'],
  ])('preserves table cells %j and %j after an unrelated edit', (left, right) => {
    const paragraph = markdownToLexicalState('Outside')
    const initialValue = JSON.stringify({
      root: {
        ...paragraph.root,
        children: [
          {
            type: 'table',
            version: 1,
            children: [
              {
                type: 'tablerow',
                version: 1,
                children: [left, right].map((text) => ({
                  type: 'tablecell',
                  version: 1,
                  headerState: 0,
                  colSpan: 1,
                  rowSpan: 1,
                  children: markdownToLexicalState(text).root.children,
                })),
              },
            ],
          },
          ...paragraph.root.children,
        ],
      },
    })
    const onChange = vi.fn()
    render(createElement(RichTextEditor, { initialValue, onChange }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: `${textarea.value}\n\nUnrelated edit` } })

    const saved = JSON.parse(onChange.mock.lastCall![0])
    expect(saved.root.children[0]).toMatchObject({
      type: 'table',
      children: [
        {
          type: 'tablerow',
          children: [
            { type: 'tablecell', children: markdownToLexicalState(left).root.children },
            { type: 'tablecell', children: markdownToLexicalState(right).root.children },
          ],
        },
      ],
    })
    expect(saved.root.children.at(-1).children[0].text).toBe('Unrelated edit')
  })
})

describe('rich text editor toolbar', () => {
  it('inserts a table that previews as a table with a header row', () => {
    const onChange = vi.fn()
    render(createElement(RichTextEditor, { onChange }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'Intro' } })
    textarea.setSelectionRange(5, 5)
    fireEvent.click(screen.getByRole('button', { name: 'Insert table' }))

    expect(textarea.value).toBe('Intro\n\n| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Preview mode' }))
    expect(screen.getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual([
      'Column 1',
      'Column 2',
    ])
    expect(screen.getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['Cell', 'Cell'])
  })

  it.each([
    ['Heading', 'one\ntwo', '## one\n## two'],
    ['Numbered list', 'one\ntwo', '1. one\n2. two'],
    ['Strikethrough', 'one', '~~one~~'],
    ['Link', 'one', '[one](https://)'],
  ])('%s formats the selection', (label, value, expected) => {
    render(createElement(RichTextEditor, { onChange: vi.fn() }))
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value } })
    textarea.setSelectionRange(0, value.length)
    fireEvent.click(screen.getByRole('button', { name: label }))
    expect(textarea.value).toBe(expected)
  })
})

describe('rich text text formats', () => {
  it('renders strikethrough and inline code with the matching Lexical format bits', () => {
    const { container } = render(
      createElement(RichTextDisplay, { content: markdownToLexicalState('~~gone~~ `code`') }),
    )
    expect(container.querySelector('s')?.textContent).toBe('gone')
    expect(container.querySelector('code')?.textContent).toBe('code')
    expect(container.querySelector('s code, code s')).toBeNull()
  })
})

describe('rich text link rendering', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,test',
    'vbscript:msgbox(1)',
  ])('neutralizes unsafe links in Preview and stored display: %s', (url) => {
    const markdown = `[Link](<${url}>)`
    const content = markdownToLexicalState(markdown)
    const stored = JSON.stringify(content)
    render(createElement(RichTextEditor, { onChange: vi.fn() }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: markdown } })
    fireEvent.click(screen.getByRole('button', { name: 'Switch to Preview mode' }))
    expect(screen.getByText('Link').closest('a')?.getAttribute('href')).toBe('#')
    cleanup()

    render(createElement(RichTextDisplay, { content: JSON.parse(stored) }))
    expect(screen.getByText('Link').closest('a')?.getAttribute('href')).toBe('#')
  })

  it.each([
    'https://example.com',
    'http://example.com',
    'mailto:a@example.com',
    'tel:+123',
    '/posts/1',
    '#reply',
  ])('preserves safe links: %s', (url) => {
    render(createElement(RichTextDisplay, { content: markdownToLexicalState(`[Link](${url})`) }))
    expect(screen.getByRole('link').getAttribute('href')).toBe(url)
  })
})
