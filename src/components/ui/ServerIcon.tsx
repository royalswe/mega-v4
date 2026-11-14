import type { SVGProps } from 'react'
import { createElement } from 'react'

/**
 * Server-safe lucide icons.
 *
 * Every icon component exported by `lucide-react` is a client component
 * (`Icon.mjs` is built under `"use client"` with `forwardRef`), so rendering
 * one inside a server component serializes a client reference into the RSC
 * payload and costs one hydration unit per occurrence — e.g. 100 feed cards
 * with 4 icons each ≈ 400 extra client components per navigation.
 *
 * This module renders the same lucide SVG as plain server markup instead. The
 * icon geometry below is copied verbatim from the `lucide-react` icon modules
 * (`dist/esm/icons/*.mjs`, `__iconData`), so the rendered output matches the
 * original components, including the default `lucide lucide-{name}` classes.
 */

type LucideNode = [tag: string, attrs: Record<string, string>]

export interface LucideIconData {
  name: string
  size?: number
  node: LucideNode[]
}

const SVG_DEFAULTS = {
  xmlns: 'http://www.w3.org/2000/svg',
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function ServerIcon({
  icon,
  size,
  className,
  ...rest
}: SVGProps<SVGSVGElement> & { icon: LucideIconData; size?: number }) {
  return (
    <svg
      {...SVG_DEFAULTS}
      width={size ?? icon.size}
      height={size ?? icon.size}
      className={className ? `lucide lucide-${icon.name} ${className}` : `lucide lucide-${icon.name}`}
      {...rest}
    >
      {icon.node.map(([tag, attrs], index) => createElement(tag, { ...attrs, key: index }))}
    </svg>
  )
}

/** Geometry copied verbatim from `lucide-react/dist/esm/icons/*.mjs`. */

export const MESSAGE_CIRCLE: LucideIconData = {
  name: 'message-circle',
  size: 24,
  node: [
    [
      'path',
      {
        d: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719',
      },
    ],
  ],
}

export const EYE: LucideIconData = {
  name: 'eye',
  size: 24,
  node: [
    [
      'path',
      {
        d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0',
      },
    ],
    ['circle', { cx: '12', cy: '12', r: '3' }],
  ],
}

export const EXTERNAL_LINK: LucideIconData = {
  name: 'external-link',
  size: 24,
  node: [
    ['path', { d: 'M15 3h6v6' }],
    ['path', { d: 'M10 14 21 3' }],
    ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
  ],
}

export const FILE_TEXT: LucideIconData = {
  name: 'file-text',
  size: 24,
  node: [
    [
      'path',
      {
        d: 'M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z',
      },
    ],
    ['path', { d: 'M14 2v5a1 1 0 0 0 1 1h5' }],
    ['path', { d: 'M10 9H8' }],
    ['path', { d: 'M16 13H8' }],
    ['path', { d: 'M16 17H8' }],
  ],
}

export const VIDEO: LucideIconData = {
  name: 'video',
  size: 24,
  node: [
    ['path', { d: 'm16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5' }],
    ['rect', { x: '2', y: '6', width: '14', height: '12', rx: '2' }],
  ],
}

export const IMAGE: LucideIconData = {
  name: 'image',
  size: 24,
  node: [
    ['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
    ['circle', { cx: '9', cy: '9', r: '2' }],
    ['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }],
  ],
}

export const MUSIC: LucideIconData = {
  name: 'eighth-notes',
  size: 24,
  node: [
    ['path', { d: 'M21 16V3a1 1 0 0 0-1.28-.96l-10 2.917a1 1 0 0 0-.72.96V19' }],
    ['circle', { cx: '18', cy: '16', r: '3' }],
    ['circle', { cx: '6', cy: '19', r: '3' }],
  ],
}

export const GAMEPAD_2: LucideIconData = {
  name: 'gamepad-2',
  size: 24,
  node: [
    ['line', { x1: '6', x2: '10', y1: '11', y2: '11' }],
    ['line', { x1: '8', x2: '8', y1: '9', y2: '13' }],
    ['line', { x1: '15', x2: '15.01', y1: '12', y2: '12' }],
    ['line', { x1: '18', x2: '18.01', y1: '10', y2: '10' }],
    [
      'path',
      {
        d: 'M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.545-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z',
      },
    ],
  ],
}

export const MENU: LucideIconData = {
  name: 'menu',
  size: 24,
  node: [
    ['path', { d: 'M4 5h16' }],
    ['path', { d: 'M4 12h16' }],
    ['path', { d: 'M4 19h16' }],
  ],
}
