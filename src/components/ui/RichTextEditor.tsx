'use client'

import { useRef, useState, type ComponentPropsWithoutRef } from 'react'
import { Bold, Italic } from 'lucide-react'
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
    if (!initialValue) return null

    // Only preview values that really are serialized Lexical state.
    try {
      const parsed = JSON.parse(initialValue)
      return parsed && typeof parsed === 'object' && 'root' in parsed ? initialValue : null
    } catch {
      return null
    }
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

  const wrapSelection = (marker: string) => {
    const textarea = textareaRef.current
    if (!textarea || isPreview) return

    const start = textarea.selectionStart ?? markdown.length
    const end = textarea.selectionEnd ?? start
    const selected = markdown.slice(start, end)
    const nextMarkdown = markdown.slice(0, start) + marker + selected + marker + markdown.slice(end)

    setEditorValue(nextMarkdown)

    // Restore the selection around the wrapped text once React has rendered
    // the updated textarea value.
    requestAnimationFrame(() => {
      textarea.focus()
      const selectionStart = start + marker.length
      textarea.setSelectionRange(selectionStart, selectionStart + selected.length)
    })
  }

  return (
    <div className={`relative border rounded-md shadow-sm bg-background ${className || ''}`}>
      <div className="flex items-center justify-between gap-2 border-b p-2 bg-muted/20">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => wrapSelection('**')}
            disabled={isPreview}
            aria-label="Toggle Bold"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => wrapSelection('*')}
            disabled={isPreview}
            aria-label="Toggle Italic"
          >
            <Italic className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-muted-foreground hidden sm:block">
            Use Markdown (e.g. ## Title)
          </div>
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
