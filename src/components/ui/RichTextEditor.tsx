'use client'

import { useRef, useState, type ComponentPropsWithoutRef } from 'react'
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RichTextDisplay } from '@/components/ui/RichTextDisplay'
import { lexicalStateToMarkdown, markdownToLexicalJSON } from '@/lib/richTextMarkdown'

type RichTextEditorProps = Omit<
  ComponentPropsWithoutRef<'textarea'>,
  'onChange' | 'value' | 'defaultValue'
> & {
  /** Serialized Lexical state (JSON string), as stored in the database. */
  initialValue?: string
  /** Emits serialized Lexical state (JSON string) for the form value. */
  onChange: (jsonString: string) => void
}

export function RichTextEditor({
  initialValue,
  onChange,
  placeholder = 'Enter some text...',
  className,
  ...textareaProps
}: RichTextEditorProps) {
  const [markdown, setMarkdown] = useState(() => lexicalStateToMarkdown(initialValue))
  const [isPreview, setIsPreview] = useState(false)
  const [jsonState, setJsonState] = useState<string | null>(() => {
    if (!initialValue?.trim()) return null

    try {
      const parsed = JSON.parse(initialValue)
      if (parsed && typeof parsed === 'object' && 'root' in parsed) return initialValue
    } catch {
      // Older values can contain plain text rather than serialized state.
    }
    return markdownToLexicalJSON(initialValue)
  })
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const setEditorValue = (nextMarkdown: string) => {
    setMarkdown(nextMarkdown)

    if (nextMarkdown.trim() === '') {
      setJsonState(null)
      onChange('')
      return
    }

    const json = markdownToLexicalJSON(nextMarkdown)
    setJsonState(json)
    onChange(json)
  }

  /** Replaces `start..end` with `text` and selects `text[selectFrom..selectTo]`. */
  const replaceRange = (
    start: number,
    end: number,
    text: string,
    selectFrom = text.length,
    selectTo = selectFrom,
  ) => {
    const textarea = textareaRef.current
    setEditorValue(markdown.slice(0, start) + text + markdown.slice(end))

    // Restore the selection once React has rendered the updated textarea value.
    requestAnimationFrame(() => {
      textarea?.focus()
      textarea?.setSelectionRange(start + selectFrom, start + selectTo)
    })
  }

  const getSelection = () => {
    const textarea = textareaRef.current
    const start = textarea?.selectionStart ?? markdown.length
    const end = textarea?.selectionEnd ?? start
    return { start, end, selected: markdown.slice(start, end) }
  }

  const wrapSelection = (marker: string, fallback: string) => {
    const { start, end, selected } = getSelection()
    const inner = selected || fallback
    replaceRange(start, end, marker + inner + marker, marker.length, marker.length + inner.length)
  }

  const insertLink = () => {
    const { start, end, selected } = getSelection()
    const label = selected || 'link text'
    const text = `[${label}](https://)`
    replaceRange(start, end, text, label.length + 3, text.length - 1)
  }

  // Applies a block prefix to every line touched by the selection.
  const prefixLines = (prefix: (index: number) => string) => {
    const { start, end } = getSelection()
    const lineStart = markdown.lastIndexOf('\n', start - 1) + 1
    const nextBreak = markdown.indexOf('\n', end)
    const lineEnd = nextBreak === -1 ? markdown.length : nextBreak
    const text = markdown
      .slice(lineStart, lineEnd)
      .split('\n')
      .map((line, index) => prefix(index) + line)
      .join('\n')
    replaceRange(lineStart, lineEnd, text)
  }

  // Inserts a standalone block, padded with blank lines so it parses on its own.
  const insertBlock = (block: string, selectFrom: number, selectTo: number) => {
    const { start, end } = getSelection()
    const before = markdown.slice(0, start)
    const after = markdown.slice(end)
    const lead =
      before === '' || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'
    const trail =
      after === '' || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n'
    replaceRange(start, end, lead + block + trail, lead.length + selectFrom, lead.length + selectTo)
  }

  const insertCodeBlock = () => {
    const code = getSelection().selected || 'code'
    insertBlock('```\n' + code + '\n```', 4, 4 + code.length)
  }

  const insertTable = () => {
    const table = '| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |'
    insertBlock(table, 2, 10)
  }

  const tools = [
    { label: 'Heading', icon: Heading2, run: () => prefixLines(() => '## ') },
    { label: 'Bold', icon: Bold, run: () => wrapSelection('**', 'bold text') },
    { label: 'Italic', icon: Italic, run: () => wrapSelection('*', 'italic text') },
    { label: 'Strikethrough', icon: Strikethrough, run: () => wrapSelection('~~', 'text') },
    { label: 'Inline code', icon: Code, run: () => wrapSelection('`', 'code') },
    { label: 'Link', icon: LinkIcon, run: insertLink },
    { label: 'Bulleted list', icon: List, run: () => prefixLines(() => '- ') },
    { label: 'Numbered list', icon: ListOrdered, run: () => prefixLines((i) => `${i + 1}. `) },
    { label: 'Quote', icon: Quote, run: () => prefixLines(() => '> ') },
    { label: 'Code block', icon: SquareCode, run: insertCodeBlock },
    { label: 'Insert table', icon: Table, run: insertTable },
  ]

  return (
    <div className={`relative border rounded-md shadow-sm bg-background ${className || ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b p-2 bg-muted/20">
        <div className="flex flex-wrap items-center gap-1">
          {tools.map(({ label, icon: Icon, run }) => (
            <Button
              key={label}
              variant="ghost"
              size="sm"
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => !isPreview && run()}
              disabled={isPreview}
              aria-label={label}
              title={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground hidden sm:block">Markdown supported</div>
          <Button
            variant={isPreview ? 'secondary' : 'outline'}
            size="sm"
            type="button"
            onClick={() => setIsPreview((value) => !value)}
            aria-label={isPreview ? 'Switch to Edit mode' : 'Switch to Preview mode'}
          >
            {isPreview ? 'Edit' : 'Preview'}
          </Button>
        </div>
      </div>

      {isPreview ? (
        <div className="min-h-37.5 p-4 prose dark:prose-invert max-w-none">
          {jsonState ? (
            <RichTextDisplay content={JSON.parse(jsonState)} />
          ) : (
            <p className="text-muted-foreground opacity-50">{placeholder}</p>
          )}
        </div>
      ) : (
        <textarea
          {...textareaProps}
          ref={textareaRef}
          value={markdown}
          onChange={(event) => setEditorValue(event.target.value)}
          placeholder={placeholder}
          className="block w-full min-h-37.5 resize-y field-sizing-content bg-transparent p-4 leading-6 outline-none placeholder:text-muted-foreground"
        />
      )}
    </div>
  )
}
