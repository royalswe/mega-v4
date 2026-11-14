import { createEditor, type LexicalEditor, type SerializedEditorState } from 'lexical'
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
} from '@lexical/markdown'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table'

const NODES = [
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
]

/**
 * A detached Lexical editor used only for markdown <-> Lexical JSON
 * conversion. It is never attached to the DOM, so it can run on the client
 * (preview) and in Node (tests, server rendering) alike.
 */
let converter: LexicalEditor | null = null

function getConverter(): LexicalEditor {
  if (!converter) {
    converter = createEditor({
      namespace: 'RichTextMarkdownConverter',
      nodes: NODES,
      onError(error) {
        console.error(error)
      },
    })
  }

  return converter
}

function isSerializedEditorState(value: unknown): value is SerializedEditorState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'root' in value &&
    typeof (value as { root?: unknown }).root === 'object'
  )
}

/**
 * Converts markdown source into serialized Lexical state.
 *
 * Lexical's default normalization treats a single newline as a soft line
 * break (`<br>`), so pressing Enter once produces a row break rather than a
 * new paragraph with extra vertical spacing. A blank line still starts a new
 * paragraph.
 */
export function markdownToLexicalState(markdown: string): SerializedEditorState {
  const editor = getConverter()

  editor.update(
    () => {
      $convertFromMarkdownString(markdown, TRANSFORMERS)
    },
    { discrete: true },
  )

  return editor.getEditorState().toJSON()
}

export function markdownToLexicalJSON(markdown: string): string {
  return JSON.stringify(markdownToLexicalState(markdown))
}

/**
 * Converts previously serialized Lexical state back to markdown source.
 * Non-JSON input is treated as markdown already, which keeps the editor
 * forgiving if an older plain-text value is passed in.
 */
export function lexicalStateToMarkdown(serialized?: string | null): string {
  if (!serialized) return ''

  let parsed: unknown
  try {
    parsed = JSON.parse(serialized)
  } catch {
    return serialized
  }

  if (!isSerializedEditorState(parsed)) return serialized

  const editor = getConverter()

  try {
    editor.setEditorState(editor.parseEditorState(parsed))
  } catch {
    return serialized
  }

  return editor.read(() => $convertToMarkdownString(TRANSFORMERS))
}
