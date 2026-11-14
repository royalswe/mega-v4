import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { LinkIcon } from '@/components/links/LinkIcon'

describe('LinkIcon', () => {
  it.each(['constructor', 'toString', '__proto__', 'unknown'])(
    'uses the article defaults for unsupported type %s',
    (type) => {
      expect(renderToStaticMarkup(createElement(LinkIcon, { type }))).toBe(
        renderToStaticMarkup(createElement(LinkIcon, { type: 'article' })),
      )
    },
  )

  it('preserves the icon and color for a supported type', () => {
    const markup = renderToStaticMarkup(createElement(LinkIcon, { type: 'video' }))
    expect(markup).toContain('lucide-video')
    expect(markup).toContain('text-red-500')
  })
})
