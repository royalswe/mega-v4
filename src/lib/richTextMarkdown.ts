import {
  $createLineBreakNode,
  $createParagraphNode,
  $getRoot,
  $isParagraphNode,
  createEditor,
  type LexicalEditor,
  type LexicalNode,
  type SerializedEditorState,
} from 'lexical'
import {
  $convertFromMarkdownString,
  $convertToMarkdownString,
  TRANSFORMERS,
  type ElementTransformer,
} from '@lexical/markdown'
import { HeadingNode, QuoteNode } from '@lexical/rich-text'
import { ListNode, ListItemNode } from '@lexical/list'
import { CodeNode, CodeHighlightNode } from '@lexical/code'
import { AutoLinkNode, LinkNode } from '@lexical/link'
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  $isTableCellNode,
  $isTableNode,
  $isTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table'

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

function parseTableCells(source: string): string[] {
  const cells = ['']
  for (let index = 0; index < source.length; index++) {
    const character = source[index]
    const next = source[index + 1]
    if (character === '\\' && (next === '\\' || next === '|' || next === 'n')) {
      cells[cells.length - 1] += next === 'n' ? '\n' : next
      index++
    } else if (character === '|') {
      cells.push('')
    } else {
      cells[cells.length - 1] += character
    }
  }
  return cells.map((cell) => cell.trim())
}

// Registering table nodes alone does not preserve cell boundaries in markdown.
const TABLE: ElementTransformer = {
  type: 'element',
  dependencies: [TableNode, TableRowNode, TableCellNode],
  regExp: /^\|(.+)\|[ \t]*$/,
  export(node) {
    if (!$isTableNode(node)) return null

    return node
      .getChildren()
      .filter($isTableRowNode)
      .flatMap((row) => {
        const cells = row.getChildren().filter($isTableCellNode)
        const values = cells.map((cell) =>
          $convertToMarkdownString(EDITOR_TRANSFORMERS, cell)
            .replace(/\\/g, '\\\\')
            .replace(/\|/g, '\\|')
            .replace(/\n/g, '\\n'),
        )
        const line = `| ${values.join(' | ')} |`
        return cells.every((cell) => cell.hasHeaderState(TableCellHeaderStates.ROW))
          ? [line, `| ${cells.map(() => '---').join(' | ')} |`]
          : [line]
      })
      .join('\n')
  },
  replace(parent, _children, match) {
    const values = parseTableCells(match[1])
    const previous = parent.getPreviousSibling()
    if (values.every((value) => /^:?-+:?$/.test(value))) {
      const row = $isTableNode(previous) ? previous.getLastChild() : null
      if (!$isTableRowNode(row)) return false
      for (const cell of row.getChildren().filter($isTableCellNode)) {
        cell.setHeaderStyles(TableCellHeaderStates.ROW)
      }
      parent.remove()
      return
    }

    const row = $createTableRowNode()
    for (const value of values) {
      const cell = $createTableCellNode(TableCellHeaderStates.NO_STATUS)
      $convertFromMarkdownString(value, EDITOR_TRANSFORMERS, cell)
      row.append(cell)
    }
    if ($isTableNode(previous)) {
      previous.append(row)
      parent.remove()
    } else {
      parent.replace($createTableNode().append(row))
    }
  },
}

const EDITOR_TRANSFORMERS = [TABLE, ...TRANSFORMERS]

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
        throw error
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

type SerializedNodeLike = { type?: string; children?: SerializedNodeLike[] } & Record<
  string,
  unknown
>

const isLinkNode = (node: SerializedNodeLike) => node.type === 'link' || node.type === 'autolink'

function mapLinkNodes(
  node: SerializedNodeLike,
  map: (link: SerializedNodeLike) => SerializedNodeLike,
): SerializedNodeLike {
  const mapped = isLinkNode(node) ? map(node) : node
  return mapped.children
    ? { ...mapped, children: mapped.children.map((child) => mapLinkNodes(child, map)) }
    : mapped
}

// Payload's link feature validates `fields.url`, whereas @lexical/link stores `url` at the top level.
function toPayloadLink({
  url,
  rel: _rel,
  target: _target,
  title: _title,
  ...link
}: SerializedNodeLike) {
  return { ...link, fields: { linkType: 'custom', url, newTab: true } }
}

function fromPayloadLink(link: SerializedNodeLike) {
  const fields = link.fields as { url?: unknown } | undefined
  if (typeof link.url === 'string') return link
  return { ...link, url: typeof fields?.url === 'string' ? fields.url : '' }
}

const $isBlankParagraph = (node: LexicalNode) =>
  $isParagraphNode(node) && node.getTextContent().trim() === ''

/**
 * Lexical's newline-preserving import yields one block per source line. This
 * folds that back into Markdown semantics: adjacent lines join with a line
 * break, one blank line separates blocks, and each extra blank line is kept
 * as an empty paragraph. Leading and trailing blank lines are dropped.
 */
function $foldPreservedLines() {
  let previous: LexicalNode | null = null
  let blankLines = 0
  for (const child of $getRoot().getChildren()) {
    if ($isBlankParagraph(child)) {
      if (previous && blankLines > 0) {
        const empty = $createParagraphNode()
        child.replace(empty)
        previous = empty
      } else {
        child.remove()
      }
      blankLines++
      continue
    }
    if (blankLines === 0 && $isParagraphNode(previous) && $isParagraphNode(child)) {
      previous.append($createLineBreakNode(), ...child.getChildren())
      child.remove()
      continue
    }
    previous = child
    blankLines = 0
  }
  let last = $getRoot().getLastChild()
  while (last && $isBlankParagraph(last)) {
    last.remove()
    last = $getRoot().getLastChild()
  }
}

/** Inverse of `$foldPreservedLines`: a blank line after every block except the last. */
function $unfoldPreservedLines() {
  for (const child of $getRoot().getChildren()) {
    if (!$isBlankParagraph(child) && child.getNextSibling()) {
      child.insertAfter($createParagraphNode())
    }
  }
}

/**
 * Converts markdown source into serialized Lexical state.
 *
 * A single newline is a soft line break (`<br>`) and a blank line starts a new
 * paragraph. Further blank lines are kept as empty paragraphs, so the preview
 * shows the same vertical gap as the textarea.
 */
export function markdownToLexicalState(markdown: string): SerializedEditorState {
  const editor = getConverter()

  editor.update(
    () => {
      $convertFromMarkdownString(markdown, EDITOR_TRANSFORMERS, undefined, true)
      $foldPreservedLines()
    },
    { discrete: true },
  )

  const state = editor.getEditorState().toJSON()
  return {
    root: mapLinkNodes(state.root as unknown as SerializedNodeLike, toPayloadLink),
  } as unknown as SerializedEditorState
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

  let markdown = ''
  try {
    const root = mapLinkNodes(parsed.root as unknown as SerializedNodeLike, fromPayloadLink)
    editor.setEditorState(editor.parseEditorState({ root } as unknown as SerializedEditorState))
    editor.update(
      () => {
        $unfoldPreservedLines()
        markdown = $convertToMarkdownString(EDITOR_TRANSFORMERS, undefined, true)
      },
      { discrete: true },
    )
  } catch {
    return serialized
  }

  return markdown
}
