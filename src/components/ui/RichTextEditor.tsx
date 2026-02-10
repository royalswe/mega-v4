'use client'

import { useEffect, useState } from 'react'
import { LexicalComposer, InitialConfigType } from '@lexical/react/LexicalComposer'
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin'
import { ContentEditable } from '@lexical/react/LexicalContentEditable'
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin'
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'
import { ListItemNode, ListNode } from '@lexical/list'
import { CodeHighlightNode, CodeNode } from '@lexical/code'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin'
import { ListPlugin } from '@lexical/react/LexicalListPlugin'
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin'
import { TRANSFORMERS } from '@lexical/markdown'
import { Button } from '@/components/ui/button'
import { Bold, Italic, Underline } from 'lucide-react'
import { FORMAT_TEXT_COMMAND, $getSelection, $isRangeSelection } from 'lexical'
import { RichTextDisplay } from '@/components/ui/RichTextDisplay'

const theme = {
  // Theme styling (Tailwind classes)
  ltr: 'ltr',
  rtl: 'rtl',
  placeholder: 'editor-placeholder',
  paragraph: 'mb-2',
  quote: 'border-l-4 border-muted pl-4 italic mb-2',
  heading: {
    h1: 'text-2xl font-bold mb-3',
    h2: 'text-xl font-bold mb-2',
  },
  list: {
    nested: {
      listitem: 'ml-4',
    },
    ol: 'list-decimal ml-6 mb-2',
    ul: 'list-disc ml-6 mb-2',
    listitem: 'mb-1',
  },
  image: 'editor-image',
  link: 'text-blue-500 hover:underline',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    underlineStrikethrough: 'underline line-through',
    code: 'bg-muted px-1 py-0.5 rounded text-sm',
  },
  code: 'bg-muted p-3 rounded mb-2 overflow-x-auto block font-mono text-sm',
}

function ToolbarPlugin({
  isPreview,
  setIsPreview,
}: {
  isPreview: boolean
  setIsPreview: (v: boolean) => void
}) {
  const [editor] = useLexicalComposerContext()
  const [isBold, setIsBold] = useState(false)
  const [isItalic, setIsItalic] = useState(false)
  const [isUnderline, setIsUnderline] = useState(false)

  const updateToolbar = () => {
    const selection = $getSelection()
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat('bold'))
      setIsItalic(selection.hasFormat('italic'))
      setIsUnderline(selection.hasFormat('underline'))
    }
  }

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        updateToolbar()
      })
    })
  }, [editor])

  return (
    <div className="flex items-center justify-between border-b p-2 bg-muted/20">
      <div className="flex items-center gap-1">
        <Button
          variant={isBold ? 'secondary' : 'ghost'}
          size="sm"
          type="button"
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
          disabled={isPreview}
          aria-label="Toggle Bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          variant={isItalic ? 'secondary' : 'ghost'}
          size="sm"
          type="button"
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
          disabled={isPreview}
          aria-label="Toggle Italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          variant={isUnderline ? 'secondary' : 'ghost'}
          size="sm"
          type="button"
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
          disabled={isPreview}
          aria-label="Toggle Underline"
        >
          <Underline className="h-4 w-4" />
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
          onClick={() => setIsPreview(!isPreview)}
          aria-label={isPreview ? 'Switch to Edit mode' : 'Switch to Preview mode'}
        >
          {isPreview ? 'Edit' : 'Preview'}
        </Button>
      </div>
    </div>
  )
}

function Placeholder({ text }: { text: string }) {
  return (
    <div className="absolute top-16.5 left-4 text-muted-foreground pointer-events-none opacity-50">
      {text}
    </div>
  )
}

interface RichTextEditorProps {
  initialValue?: string // JSON string
  onChange: (jsonString: string) => void
  placeholder?: string
  className?: string
}

export function RichTextEditor({
  initialValue,
  onChange,
  placeholder = 'Enter some text...',
  className,
}: RichTextEditorProps) {
  // Use initialValue directly if provided (Lexical accepts JSON string for editorState)
  const parsedInitialValue = initialValue || undefined

  const [isPreview, setIsPreview] = useState(false)
  const [jsonState, setJsonState] = useState<string | null>(initialValue || null)

  const initialConfig: InitialConfigType = {
    namespace: 'MyEditor',
    theme,
    editorState: parsedInitialValue,
    onError(error, _editor) {
      console.error(error)
    },
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      QuoteNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      AutoLinkNode,
      LinkNode,
    ],
  }

  return (
    <div className={`relative border rounded-md shadow-sm bg-background ${className}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <ToolbarPlugin isPreview={isPreview} setIsPreview={setIsPreview} />

        <div className={isPreview ? 'hidden' : 'block'}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable className="min-h-37.5 p-4 outline-none prose dark:prose-invert max-w-none" />
            }
            placeholder={<Placeholder text={placeholder} />}
            ErrorBoundary={LexicalErrorBoundary}
          />
          <HistoryPlugin />
          <ListPlugin />
          <LinkPlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <OnChangePlugin
            onChange={(editorState) => {
              const json = JSON.stringify(editorState.toJSON())
              setJsonState(json)
              onChange(json)
            }}
          />
        </div>

        {isPreview && jsonState && (
          <div className="min-h-37.5 p-4 prose dark:prose-invert max-w-none">
            <RichTextDisplay content={JSON.parse(jsonState)} />
          </div>
        )}
      </LexicalComposer>
    </div>
  )
}
