import React from 'react'
import { SerializedLexicalNode } from 'lexical'
import { sanitizeUrl } from 'payload/shared'

interface RichTextDisplayProps {
  content: {
    root: {
      children: SerializedLexicalNode[]
      direction: ('ltr' | 'rtl') | null
      format: 'left' | 'start' | 'center' | 'right' | 'end' | 'justify' | ''
      indent: number
      type: string
      version: number
    }
  }
  className?: string
}

type RenderableLexicalNode = SerializedLexicalNode & {
  children?: RenderableLexicalNode[]
  tag?: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'
  listType?: 'number' | 'bullet'
  url?: string
  fields?: { url?: string }
  text?: string
  format?: number
  headerState?: number
}

const safeHeadingTag = (tag: unknown): 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' => {
  const allowed: Array<'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6'> = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
  ]

  if (typeof tag === 'string' && allowed.includes(tag as (typeof allowed)[number])) {
    return tag as (typeof allowed)[number]
  }

  return 'h2'
}

export function RichTextDisplay({ content, className = '' }: RichTextDisplayProps) {
  if (!content?.root?.children) {
    return null
  }

  const renderNode = (node: RenderableLexicalNode, index: number): React.ReactNode => {
    const key = `${node.type}-${index}`

    switch (node.type) {
      case 'paragraph': {
        // The gap between paragraphs is one line, matching the blank line that
        // separates them in the editor textarea. Each extra blank line is
        // stored as an empty paragraph, rendered as exactly one more line.
        const isEmpty = !node.children || node.children.length === 0
        return (
          <p key={key} className={isEmpty ? 'mb-0' : 'mb-[1lh] last:mb-3'}>
            {isEmpty
              ? '\u200B'
              : node.children?.map((child: RenderableLexicalNode, i: number) =>
                  renderNode(child, i),
                )}
          </p>
        )
      }

      case 'heading':
        const HeadingTag = safeHeadingTag(node.tag)
        const headingClasses = {
          h1: 'text-2xl font-bold mb-3',
          h2: 'text-xl font-bold mb-2',
          h3: 'text-lg font-semibold mb-2',
          h4: 'text-base font-semibold mb-1',
          h5: 'text-sm font-semibold mb-1',
          h6: 'text-xs font-semibold mb-1',
        }
        return (
          <HeadingTag key={key} className={headingClasses[HeadingTag]}>
            {node.children?.map((child: RenderableLexicalNode, i: number) => renderNode(child, i))}
          </HeadingTag>
        )

      case 'list':
        const ListTag = node.listType === 'number' ? 'ol' : 'ul'
        const listClass = node.listType === 'number' ? 'list-decimal' : 'list-disc'
        return (
          <ListTag key={key} className={`${listClass} ml-6 mb-2`}>
            {node.children?.map((child: RenderableLexicalNode, i: number) => renderNode(child, i))}
          </ListTag>
        )

      case 'listitem':
        return (
          <li key={key} className="mb-1">
            {node.children?.map((child: RenderableLexicalNode, i: number) => renderNode(child, i))}
          </li>
        )

      case 'link':
        return (
          <a
            key={key}
            href={sanitizeUrl(node.url ?? node.fields?.url ?? '')}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline break-words"
          >
            {node.children?.map((child: RenderableLexicalNode, i: number) => renderNode(child, i))}
          </a>
        )

      case 'text':
        let text: React.ReactNode = node.text

        if (node.format) {
          if (node.format & 1) {
            // Bold
            text = <strong>{text}</strong>
          }
          if (node.format & 2) {
            // Italic
            text = <em>{text}</em>
          }
          if (node.format & 4) {
            // Strikethrough
            text = <s>{text}</s>
          }
          if (node.format & 8) {
            // Underline
            text = <u>{text}</u>
          }
          if (node.format & 16) {
            // Code
            text = <code className="bg-muted px-1 py-0.5 rounded text-sm">{text}</code>
          }
        }

        return <React.Fragment key={key}>{text}</React.Fragment>

      case 'code':
        return (
          <pre key={key} className="bg-muted p-3 rounded mb-2 overflow-x-auto">
            <code>
              {node.children?.map((child: RenderableLexicalNode, i: number) =>
                renderNode(child, i),
              )}
            </code>
          </pre>
        )

      case 'quote':
        return (
          <blockquote key={key} className="border-l-4 border-muted pl-4 italic mb-2">
            {node.children?.map((child: RenderableLexicalNode, i: number) => renderNode(child, i))}
          </blockquote>
        )

      case 'table':
        return (
          <div key={key} className="mb-3 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <tbody>
                {node.children?.map((child: RenderableLexicalNode, i: number) =>
                  renderNode(child, i),
                )}
              </tbody>
            </table>
          </div>
        )

      case 'tablerow':
        return (
          <tr key={key}>
            {node.children?.map((child: RenderableLexicalNode, i: number) => renderNode(child, i))}
          </tr>
        )

      case 'tablecell': {
        const CellTag = node.headerState ? 'th' : 'td'
        return (
          <CellTag
            key={key}
            className={`border border-border px-3 py-2 text-left align-top [&_p]:mb-0 ${
              node.headerState ? 'bg-muted font-semibold' : ''
            }`}
          >
            {node.children?.map((child: RenderableLexicalNode, i: number) => renderNode(child, i))}
          </CellTag>
        )
      }

      case 'linebreak':
        return <br key={key} />

      default:
        if (node.children) {
          return (
            <React.Fragment key={key}>
              {node.children.map((child: RenderableLexicalNode, i: number) => renderNode(child, i))}
            </React.Fragment>
          )
        }
        return null
    }
  }

  return (
    <div className={`rich-text-content wrap-break-word ${className}`}>
      {content.root.children.map((node, index) => renderNode(node, index))}
    </div>
  )
}
