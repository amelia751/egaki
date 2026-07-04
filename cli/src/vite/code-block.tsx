'use client'

/**
 * CodeBlock — ray.so-faithful syntax-highlighted code block for video.
 *
 * Uses shiki (TextMate grammars + WASM) for real syntax highlighting,
 * with a CSS variables theme that maps token scopes to --ray-* vars.
 * Theme colors are injected as inline CSS custom properties. The HTML
 * from shiki's codeToHtml() is rendered via dangerouslySetInnerHTML.
 *
 * Per-theme frame styles are ported from ray.so's frame components:
 * - Vercel: gridlines + corner brackets, no window chrome
 * - Stripe: dashed gridlines + skewed stripe shape
 * - OpenAI: clean rounded window, navy background
 * - Supabase/Cloudflare: filename header, custom borders
 * - Default: macOS traffic lights + title bar (non-partner themes)
 *
 * Source: https://github.com/raycast/ray-so
 *
 * Key source files:
 * - Themes & syntax colors: https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/store/themes.ts
 * - CSS variables theme:    https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/util/theme-css-variables.ts
 * - Shiki highlighter init: https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/code.tsx
 * - Highlighted code render: https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/components/HighlightedCode.tsx
 * - Editor + token CSS:     https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/components/Editor.module.css
 * - Frame switch:           https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/components/Frame.tsx
 * - Default frame:          https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/components/frames/DefaultFrame.tsx
 * - Vercel frame:           https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/components/frames/VercelFrame.tsx
 * - Stripe frame:           https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/components/frames/StripeFrame.tsx
 * - OpenAI frame:           https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/components/frames/OpenAIFrame.tsx
 * - Supabase frame:         https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/components/frames/SupabaseFrame.tsx
 * - Cloudflare frame:       https://github.com/raycast/ray-so/blob/main/app/(navigation)/(code)/components/frames/CloudflareFrame.tsx
 */

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { interpolate, spring, useCurrentFrame, useDelayRender, useVideoConfig } from 'remotion'
import { useTweakpane } from './tweakpane-hook.tsx'

// ---------------------------------------------------------------------------
// Nesting guard
// ---------------------------------------------------------------------------

export const CodeBlockContext = createContext(false)

// ---------------------------------------------------------------------------
// CSS variables theme — exact port from ray.so's theme-css-variables.ts
// Maps TextMate scopes to --ray-* CSS variables.
// ---------------------------------------------------------------------------

function createCssVariablesTheme() {
  const prefix = '--ray-'
  const v = (name: string) => `var(${prefix}${name})`

  return {
    name: 'css-variables',
    type: 'dark' as const,
    colors: {
      'editor.foreground': v('foreground'),
      'editor.background': v('background'),
    },
    tokenColors: [
      { scope: ['keyword.operator.accessor', 'meta.group.braces.round.function.arguments', 'meta.template.expression', 'markup.fenced_code meta.embedded.block'], settings: { foreground: v('foreground') } },
      { scope: 'emphasis', settings: { fontStyle: 'italic' } },
      { scope: ['strong', 'markup.heading.markdown', 'markup.bold.markdown'], settings: { fontStyle: 'bold' } },
      { scope: ['markup.italic.markdown'], settings: { fontStyle: 'italic' } },
      { scope: 'meta.link.inline.markdown', settings: { fontStyle: 'underline', foreground: v('token-link') } },
      { scope: ['string', 'markup.fenced_code', 'markup.inline', 'string.quoted.docstring.multi.python'], settings: { foreground: v('token-string') } },
      { scope: ['comment', 'string.quoted.docstring.multi', 'meta.diff.header.from-file', 'meta.diff.header.to-file'], settings: { foreground: v('token-comment') } },
      { scope: ['constant.numeric', 'constant.language', 'constant.other.placeholder', 'constant.character.format.placeholder', 'variable.language.this', 'variable.other.object', 'variable.other.class', 'variable.other.constant', 'meta.property-name', 'meta.property-value', 'support'], settings: { foreground: v('token-constant') } },
      { scope: ['keyword', 'storage.modifier', 'storage.type', 'storage.control.clojure', 'entity.name.function.clojure', 'entity.name.tag.yaml', 'support.function.node', 'support.type.property-name.json', 'punctuation.separator.key-value', 'punctuation.definition.template-expression'], settings: { foreground: v('token-keyword') } },
      { scope: 'variable.parameter.function', settings: { foreground: v('token-parameter') } },
      { scope: ['support.function', 'entity.name.type', 'entity.other.inherited-class', 'meta.function-call', 'meta.instance.constructor', 'entity.other.attribute-name', 'entity.name.function', 'constant.keyword.clojure'], settings: { foreground: v('token-function') } },
      { scope: ['entity.name.tag', 'string.quoted', 'string.regexp', 'string.interpolated', 'string.template', 'string.unquoted.plain.out.yaml', 'keyword.other.template'], settings: { foreground: v('token-string-expression') } },
      { scope: ['punctuation.definition.arguments', 'punctuation.definition.dict', 'punctuation.separator', 'meta.function-call.arguments'], settings: { foreground: v('token-punctuation') } },
      { scope: ['markup.underline.link', 'punctuation.definition.metadata.markdown'], settings: { foreground: v('token-link') } },
      { scope: ['beginning.punctuation.definition.list.markdown'], settings: { foreground: v('token-string') } },
      { scope: ['punctuation.definition.string.begin.markdown', 'punctuation.definition.string.end.markdown', 'string.other.link.title.markdown', 'string.other.link.description.markdown'], settings: { foreground: v('token-keyword') } },
      { scope: ['constant.numeric.decimal', 'constant.language.boolean', 'meta.var.exp.ts'], settings: { foreground: v('token-number') } },
      { scope: ['meta.objectliteral'], settings: { foreground: v('token-object-literal') } },
      { scope: ['support.variable.property'], settings: { foreground: v('token-property') } },
      { scope: ['punctuation.definition.deleted.diff', 'markup.deleted.diff'], settings: { foreground: v('token-diff-deleted') } },
      { scope: ['punctuation.definition.inserted.diff', 'markup.inserted.diff'], settings: { foreground: v('token-diff-inserted') } },
    ],
  }
}

const CSS_VARS_THEME = createCssVariablesTheme()

// ---------------------------------------------------------------------------
// Shiki highlighter — lazy singleton
// ---------------------------------------------------------------------------

type ShikiHighlighter = {
  codeToHtml: (code: string, options: any) => string
  getLoadedLanguages: () => string[]
  loadLanguage: (lang: any) => Promise<void>
}

let highlighterPromise: Promise<ShikiHighlighter> | null = null
let highlighterInstance: ShikiHighlighter | null = null

async function getHighlighter(): Promise<ShikiHighlighter> {
  if (highlighterInstance) return highlighterInstance
  if (highlighterPromise) return highlighterPromise

  highlighterPromise = (async () => {
    const { createHighlighter } = await import('shiki')
    const h = await createHighlighter({
      themes: [CSS_VARS_THEME as any],
      langs: ['typescript', 'tsx', 'javascript', 'jsx', 'python', 'bash', 'json', 'css', 'html', 'markdown', 'yaml', 'rust', 'go', 'sql', 'diff', 'swift', 'ruby', 'java', 'c', 'cpp'],
    })
    highlighterInstance = h
    return h
  })()

  return highlighterPromise
}

// ---------------------------------------------------------------------------
// Syntax colors type + CSS variable conversion (from ray.so themes.ts)
// ---------------------------------------------------------------------------

type SyntaxColors = {
  foreground: string
  constant?: string
  string?: string
  comment?: string
  keyword?: string
  parameter?: string
  function?: string
  stringExpression?: string
  punctuation?: string
  link?: string
  number?: string
  property?: string
  objectLiteral?: string
  highlight?: string
  highlightBorder?: string
  highlightHover?: string
  diffDeleted?: string
  diffInserted?: string
}

function syntaxToCssVars(s: SyntaxColors): CSSProperties {
  return {
    '--ray-foreground': s.foreground,
    '--ray-token-constant': s.constant,
    '--ray-token-string': s.string,
    '--ray-token-comment': s.comment,
    '--ray-token-keyword': s.keyword,
    '--ray-token-parameter': s.parameter,
    '--ray-token-function': s.function,
    '--ray-token-string-expression': s.stringExpression,
    '--ray-token-punctuation': s.punctuation,
    '--ray-token-link': s.link,
    '--ray-token-number': s.number,
    '--ray-token-property': s.property,
    '--ray-token-object-literal': s.objectLiteral,
    '--ray-highlight': s.highlight,
    '--ray-highlight-border': s.highlightBorder,
    '--ray-highlight-hover': s.highlightHover,
    '--ray-token-diff-deleted': s.diffDeleted,
    '--ray-token-diff-inserted': s.diffInserted,
  } as CSSProperties
}

// ---------------------------------------------------------------------------
// Frame type — determines the visual wrapper around the code
// ---------------------------------------------------------------------------

type FrameType =
  | 'default'    // macOS traffic lights + title
  | 'vercel'     // gridlines + corner brackets
  | 'stripe'     // dashed gridlines + skewed stripe
  | 'openai'     // clean rounded window
  | 'supabase'   // filename header
  | 'cloudflare' // gridlines + filename header

// ---------------------------------------------------------------------------
// Theme type
// ---------------------------------------------------------------------------

/** Font stack used for code rendering. Uses the preferred theme font with
 *  safe system monospace fallbacks. ray.so uses per-theme web fonts (Geist
 *  Mono, Source Code Pro, etc.) which are loaded via Next.js font optimization.
 *  In egaki video we can't rely on web fonts being installed, so the stack
 *  falls through to SF Mono / Menlo / Consolas which are available on every
 *  major OS and render digits correctly in all browsers. */
const CODE_FONT = '"SF Mono", "Menlo", "Consolas", "Liberation Mono", monospace'
const CODE_FONT_WEIGHT = 400

export type CodeBlockTheme = {
  id: string
  name: string
  background: { from: string; to: string }
  frame: FrameType
  /** Decorative — the preferred font name from ray.so. Not used for rendering
   *  since web fonts aren't guaranteed; kept for documentation only. */
  font?: string
  /** Per-frame visual overrides */
  frameColors?: {
    windowBg?: string
    windowBgLight?: string
    border?: string
    borderLight?: string
    headerBg?: string
    headerBgLight?: string
    gridline?: string
    gridlineLight?: string
    lineNumber?: string
    lineNumberLight?: string
    frameBg?: string
    frameBgLight?: string
  }
  syntax: {
    light?: SyntaxColors
    dark?: SyntaxColors
  }
}

// ---------------------------------------------------------------------------
// Themes — curated from ray.so
// ---------------------------------------------------------------------------

export const CODE_THEMES: Record<string, CodeBlockTheme> = {
  vercel: {
    id: 'vercel',
    name: 'Vercel',
    background: { from: '#232323', to: '#1F1F1F' },
    frame: 'vercel',
    font: 'geist-mono',
    frameColors: {
      frameBg: '#000000',
      frameBgLight: '#ffffff',
      gridline: '#1a1a1a',
      gridlineLight: '#ebebeb',
    },
    syntax: {
      light: { foreground: 'hsla(0, 0%, 9%, 1)', constant: 'oklch(53.18% 0.2399 256.99)', string: 'oklch(51.75% 0.1453 147.65)', comment: 'hsla(0, 0%, 40%, 1)', keyword: 'oklch(53.5% 0.2058 2.84)', parameter: 'oklch(52.79% 0.1496 54.65)', function: 'oklch(47.18% 0.2579 304)', stringExpression: 'oklch(51.75% 0.1453 147.65)', punctuation: 'hsla(0, 0%, 9%, 1)', number: '#111111', property: 'oklch(53.18% 0.2399 256.99)', highlight: 'oklch(94.58% 0.0293 249.85)', highlightHover: 'oklch(94.58% 0.0293 249.85 / 30%)', highlightBorder: 'oklch(53.18% 0.2399 256.99)' },
      dark: { foreground: 'hsla(0, 0%, 93%, 1)', constant: 'oklch(71.7% 0.1648 250.79)', string: 'oklch(73.1% 0.2158 148.29)', comment: 'hsla(0, 0%, 63%, 1)', keyword: 'oklch(69.36% 0.2223 3.91)', parameter: 'oklch(77.21% 0.1991 64.28)', function: 'oklch(69.87% 0.2037 309.51)', stringExpression: 'oklch(73.1% 0.2158 148.29)', punctuation: 'hsla(0, 0%, 93%, 1)', number: '#ffffff', property: 'oklch(71.7% 0.1648 250.79)', highlight: 'oklch(30.86% 0.1022 255.21)', highlightHover: 'oklch(30.86% 0.1022 255.21 / 30%)', highlightBorder: 'oklch(71.7% 0.1648 250.79)' },
    },
  },
  stripe: {
    id: 'stripe',
    name: 'Stripe',
    background: { from: '#0a2540', to: '#0a2540' },
    frame: 'stripe',
    font: 'source-code-pro',
    frameColors: {
      frameBg: '#0a2540',
      windowBg: '#0c2e4e',
      border: '#0f395e',
      gridline: 'rgba(255, 255, 255, 0.1)',
      lineNumber: '#55718d',
    },
    syntax: {
      dark: { foreground: '#FFFFFF', constant: '#FFFFFF', string: '#ffa956', comment: '#a9bcce', keyword: '#8095ff', parameter: '#FF6B35', function: '#00d4ff', stringExpression: '#ffa956', punctuation: '#FFFFFF', number: '#ffa956', property: '#1abdc0', objectLiteral: '#1abdc0', highlight: 'rgba(255, 107, 53, 0.15)', highlightBorder: '#FF6B35', highlightHover: 'rgba(255, 107, 53, 0.08)' },
    },
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    background: { from: '#000', to: '#000' },
    frame: 'openai',
    font: 'soehne-mono',
    frameColors: {
      frameBg: '#121a29',
      frameBgLight: 'linear-gradient(238deg, #f1f0f4 0%, #f8f8fd 100%)',
      windowBg: '#232b41',
      windowBgLight: '#fff',
      border: 'rgba(255, 255, 255, 0.1)',
      borderLight: 'rgba(0, 0, 0, 0.1)',
      lineNumber: 'rgba(255, 255, 255, 0.2)',
      lineNumberLight: 'hsla(240, 12%, 71%, 1)',
    },
    syntax: {
      light: { foreground: '#171717', constant: '#DF3079', string: '#171717', comment: 'hsla(240, 12%, 71%, 1)', keyword: '#2E95D3', parameter: '#ededed', function: '#00A67D', stringExpression: '#00a67d', punctuation: '#171717', number: '#e9950c', property: '#F22C3D' },
      dark: { foreground: '#fff', constant: '#df3079', string: '#fff', comment: 'rgba(255,255,255,0.4)', keyword: '#2E95D3', parameter: '#fff', function: '#00A67D', stringExpression: '#00A67D', punctuation: '#fff', number: '#e9950c', property: '#F22C3D', highlight: 'rgba(255, 255, 255, 0.05)', highlightHover: 'rgba(255, 255, 255, 0.03)' },
    },
  },
  supabase: {
    id: 'supabase',
    name: 'Supabase',
    background: { from: '#121212', to: '#121212' },
    frame: 'supabase',
    font: 'jetbrains-mono',
    frameColors: {
      frameBg: '#121212',
      frameBgLight: '#fcfcfc',
      windowBg: '#171717',
      windowBgLight: '#f8f8f8',
      border: '#292929',
      borderLight: '#dfdfdf',
      headerBg: '#1f1f1f',
      headerBgLight: '#fcfcfc',
    },
    syntax: {
      light: { foreground: '#525252', constant: '#15593b', string: '#f1a10d', comment: '#7e7e7e', keyword: '#6b35dc', parameter: '#525252', function: '#15593b', stringExpression: '#f1a10d', punctuation: '#a0a0a0', number: '#525252', property: '#15593b', highlight: 'oklch(0.88 0.22 153.28 / 0.12)', highlightHover: 'oklch(0.88 0.22 153.28 / 0.06)', highlightBorder: '#009a55' },
      dark: { foreground: '#ffffff', constant: '#3ecf8e', string: '#ffcda1', comment: '#7e7e7e', keyword: '#bda4ff', parameter: '#ffffff', function: '#3ecf8e', stringExpression: '#ffcda1', punctuation: '#ffffff', number: '#ededed', property: '#3ecf8e', highlight: '#232323', highlightHover: '#1D1D1D', highlightBorder: '#383838' },
    },
  },
  cloudflare: {
    id: 'cloudflare',
    name: 'Cloudflare',
    background: { from: '#0C0C0C', to: '#0C0C0C' },
    frame: 'cloudflare',
    font: 'ibm-plex-mono',
    frameColors: {
      frameBg: '#0c0c0c',
      frameBgLight: '#f5f5f5',
      windowBg: '#0c0c0c',
      windowBgLight: '#ffffff',
      border: 'transparent',
      borderLight: 'transparent',
      headerBg: '#0f0f0f',
      headerBgLight: '#fafafa',
      gridline: '#262626',
      gridlineLight: '#e5e5e5',
    },
    syntax: {
      light: { foreground: '#521000', constant: '#5a11cc', string: '#0876d9', comment: '#52100080', keyword: '#d94008', parameter: '#c77700', function: '#7612cc', stringExpression: '#0876d9', punctuation: '#52100080', number: '#5a11cc', property: '#5a11cc', highlight: 'rgba(255, 80, 10, 0.1)', highlightHover: 'rgba(255, 80, 10, 0.05)', highlightBorder: '#FF500A' },
      dark: { foreground: '#E8E8E8', constant: '#79b8ff', string: '#0A95FF', comment: '#888888', keyword: '#FF7F4D', parameter: '#FFB366', function: '#B084FF', stringExpression: '#0A95FF', punctuation: '#AAAAAA', number: '#79b8ff', property: '#79b8ff', highlight: 'rgba(255, 80, 10, 0.15)', highlightHover: 'rgba(255, 80, 10, 0.08)', highlightBorder: '#FF500A' },
    },
  },
  gemini: {
    id: 'gemini', name: 'Gemini', background: { from: '#16181d', to: '#16181d' }, frame: 'default',
    syntax: { dark: { foreground: '#abb2bf', constant: '#56b6c2', string: '#98c379', comment: '#5c6370', keyword: '#5c9dc7', parameter: '#d19a66', function: '#98c379', stringExpression: '#98c379', punctuation: '#abb2bf', number: '#56b6c2', property: '#56b6c2', highlight: 'rgba(92, 157, 199, 0.15)', highlightHover: 'rgba(92, 157, 199, 0.1)', highlightBorder: '#5c9dc7' } },
  },
  clerk: {
    id: 'clerk', name: 'Clerk', background: { from: '#000000', to: '#000000' }, frame: 'default', font: 'geist-mono',
    syntax: { dark: { foreground: '#ffffff', constant: '#86ef9b', string: '#5de3ff', comment: '#9394a1', keyword: '#bab1ff', parameter: '#86ef9b', function: '#bab1ff', stringExpression: '#5de3ff', punctuation: '#b7b8c2', number: '#86ef9b', property: '#86ef9b', highlight: '#5de3ff1a', highlightHover: '#5de3ff0d', highlightBorder: '#00000000' } },
  },
  prisma: {
    id: 'prisma', name: 'Prisma', background: { from: '#000', to: '#000' }, frame: 'default',
    syntax: { dark: { foreground: '#ffffff', constant: '#7F9CF5', string: '#71E8DF', comment: '#718096', keyword: '#71E8DF', parameter: '#71E8DF', function: '#7F9CF5', stringExpression: '#71E8DF', punctuation: '#FFFFFF', number: '#71E8DF', property: '#71E8DF', highlight: '#71e8de2e', highlightHover: '#71e8de1b', highlightBorder: '#71E8DF' } },
  },
  elevenlabs: {
    id: 'elevenlabs', name: 'ElevenLabs', background: { from: '#000', to: '#000' }, frame: 'default', font: 'roboto-mono',
    syntax: { dark: { foreground: '#fff', constant: '#8F8FFF', string: '#a1ffe0', comment: 'hsla(0, 0%, 63%, 1)', keyword: '#fff9b2', parameter: '#8F8FFF', function: '#ff8080', stringExpression: '#A1FFE0', punctuation: '#fff', number: '#8F8FFF', property: '#8F8FFF', highlight: 'hsla(240, 100%, 78%, 0.09)', highlightHover: 'hsla(240, 100%, 78%, 0.05)', highlightBorder: 'hsla(240, 100%, 78%, 0.45)' } },
  },
  triggerdev: {
    id: 'triggerdev', name: 'Trigger.dev', background: { from: '#121317', to: '#121317' }, frame: 'default', font: 'geist-mono',
    syntax: { dark: { foreground: '#CCCBFF', constant: '#9C9AF2', string: '#AFEC73', comment: '#5F6570', keyword: '#E888F8', parameter: '#CCCBFF', function: '#9684FF', stringExpression: '#AFEC73', punctuation: '#878C99', number: '#b5cea8', property: '#CCCBFF' } },
  },
  nuxt: {
    id: 'nuxt', name: 'Nuxt', background: { from: '#292D3E', to: '#292D3E' }, frame: 'default', font: 'geist-mono',
    syntax: { dark: { foreground: '#babed8', constant: '#BABED8', string: '#C3E88D', comment: '#676E95', keyword: '#C793EA', parameter: '#babed8', function: '#82AAFF', stringExpression: '#f07178', punctuation: '#89DDFF', number: '#F78C6C', property: '#f07178', highlight: 'rgba(113, 124, 180, 0.31)', highlightHover: 'rgba(113, 124, 180, 0.2)', highlightBorder: '#80CBC4' } },
  },
  tailwind: {
    id: 'tailwind', name: 'Tailwind', background: { from: '#36B6F0', to: '#36B6F0' }, frame: 'default', font: 'fira-code',
    syntax: { dark: { foreground: '#fff', constant: '#C1B2F9', string: '#C1B2F9', comment: 'rgba(255,255,255,0.4)', keyword: '#C1B2F9', punctuation: 'rgba(255,255,255,0.6)', number: '#C1B2F9', property: '#C1B2F9', function: '#fff', highlight: 'rgba(193,178,249,0.12)', highlightBorder: '#C1B2F9' } },
  },
  resend: {
    id: 'resend', name: 'Resend', background: { from: '#B1B1B1', to: '#181818' }, frame: 'default', font: 'commit-mono',
    syntax: { dark: { foreground: '#ffffff', constant: '#a7a7a7', string: '#a7a7a7', comment: '#666666', keyword: '#a7a7a7', function: '#ffffff', punctuation: '#a7a7a7', number: '#ffffff', property: '#a7a7a7' } },
  },
  auth0: {
    id: 'auth0', name: 'Auth0', background: { from: '#171717', to: '#24173A' }, frame: 'default',
    syntax: { dark: { foreground: '#F1F1F1', constant: '#99A7F1', string: '#98D2B2', comment: '#808080', keyword: '#B59DF8', parameter: '#F1F1F1', function: '#8B66F4', stringExpression: '#98D2B2', punctuation: '#FDE66F', number: '#B59DF8', property: '#B9C3F5', highlight: 'rgba(82, 139, 255, 0.24)', highlightHover: 'rgba(82, 139, 255, 0.12)', highlightBorder: '#528BFF' } },
  },
  noir: {
    id: 'noir', name: 'Noir', background: { from: '#B1B1B1', to: '#181818' }, frame: 'default',
    syntax: {
      light: { foreground: '#111111', constant: '#666666', keyword: '#666666', function: '#111111', punctuation: '#666666', string: '#666666', comment: '#999999', number: '#111111', property: '#666666' },
      dark: { foreground: '#ffffff', constant: '#a7a7a7', keyword: '#a7a7a7', function: '#ffffff', punctuation: '#a7a7a7', string: '#a7a7a7', comment: '#666666', number: '#ffffff', property: '#a7a7a7' },
    },
  },
  mono: {
    id: 'mono', name: 'Mono', background: { from: '#333', to: '#181818' }, frame: 'default',
    syntax: { dark: { foreground: '#ffffff', constant: '#a7a7a7', keyword: '#a7a7a7', function: '#ffffff', punctuation: '#a7a7a7', string: '#a7a7a7', comment: '#666666', number: '#ffffff', property: '#a7a7a7' } },
  },
  bitmap: {
    id: 'bitmap', name: 'Bitmap', background: { from: '#881616', to: '#F1393F' }, frame: 'default',
    syntax: { dark: { foreground: '#FEFDFD', constant: '#E42B37', string: '#E42B37', comment: '#996B6D', keyword: '#EB6F6F', parameter: '#C88E8E', function: '#E42B37', stringExpression: '#EBB99D', punctuation: '#EB6F6F', number: '#E42B37', property: '#E42B37', highlight: 'hsla(355, 76%, 63%, 0.25)', highlightBorder: '#E42B37', highlightHover: 'hsla(355, 76%, 63%, 0.16)' } },
  },
  ice: {
    id: 'ice', name: 'Ice', background: { from: '#fff', to: '#80deea' }, frame: 'default',
    syntax: {
      light: { foreground: '#1C1B29', constant: '#00B0E9', string: '#6ABAD8', comment: '#BDC0C1', keyword: '#81909D', parameter: '#1E3C78', function: '#1E3C78', stringExpression: '#7BBCD8', punctuation: '#1E3C78', number: '#00B0E9', property: '#00B0E9', highlight: 'rgba(0,167,219,0.1)', highlightBorder: '#00B0E9', highlightHover: 'rgba(0,167,219,0.05)' },
      dark: { foreground: '#FFFFFF', constant: '#92DEF6', string: '#92DEF6', comment: '#5C6A70', keyword: '#BFC4C9', parameter: '#778CB6', function: '#778CB6', stringExpression: '#89C3DC', punctuation: '#778CB6', number: '#00B0E9', property: '#00B0E9', highlight: 'rgba(146,222,246,0.14)', highlightBorder: '#92DEF6', highlightHover: 'rgba(146,222,246,0.09)' },
    },
  },
  sand: { id: 'sand', name: 'Sand', background: { from: '#EED5B6', to: '#AF8856' }, frame: 'default', syntax: { dark: { foreground: '#FFFFFF', constant: '#C2B181', string: '#C2B181', comment: '#837E77', keyword: '#D3B48C', parameter: '#F4A361', function: '#F4A361', stringExpression: '#EED5B8', punctuation: '#F4A361', number: '#C2B181', property: '#C2B181', highlight: 'rgba(244,163,97,0.14)', highlightBorder: '#F4A361', highlightHover: 'rgba(244,163,97,0.09)' } } },
  forest: { id: 'forest', name: 'Forest', background: { from: '#506853', to: '#213223' }, frame: 'default', syntax: { dark: { foreground: '#FFFFFF', constant: '#6B8F71', string: '#C9C8BC', comment: '#555E56', keyword: '#AAB4A3', parameter: '#6B8F71', function: '#87B882', stringExpression: '#CCBD6E', punctuation: '#AAB4A3', number: '#AAB4A3', property: '#C9C7BC', highlight: 'rgba(170,180,163,0.14)', highlightBorder: '#6B8F71', highlightHover: 'rgba(170,180,163,0.09)' } } },
  breeze: { id: 'breeze', name: 'Breeze', background: { from: '#CF2F98', to: '#6A3DEC' }, frame: 'default', syntax: { dark: { foreground: '#FFFFFF', constant: '#49E8F2', string: '#E9AEFE', comment: '#8A757D', keyword: '#6599FF', parameter: '#F8518D', function: '#F8518D', stringExpression: '#E9AEFE', punctuation: '#F8518D', number: '#55E7B2', property: '#49E8F2' } } },
  candy: { id: 'candy', name: 'Candy', background: { from: '#A58EFB', to: '#E9BFF8' }, frame: 'default', syntax: { dark: { foreground: '#FFFFFF', constant: '#1AC8FF', string: '#DFD473', comment: '#807796', keyword: '#FF659C', parameter: '#1AC8FF', function: '#73DFA5', stringExpression: '#DFD473', punctuation: '#FF659C', number: '#7A7FFD', property: '#1AC8FF' } } },
  crimson: { id: 'crimson', name: 'Crimson', background: { from: '#FF6363', to: '#733434' }, frame: 'default', syntax: { dark: { foreground: '#FEFDFD', constant: '#D15510', string: '#EBB99D', comment: '#895E60', keyword: '#EB6F6F', parameter: '#C88E8E', function: '#C88E8E', stringExpression: '#EBB99D', punctuation: '#EB6F6F', number: '#FDA97A', property: '#D15510' } } },
  falcon: { id: 'falcon', name: 'Falcon', background: { from: '#BDE3EC', to: '#363654' }, frame: 'default', syntax: { dark: { foreground: '#FFFFFF', constant: '#799DB1', string: '#6A8697', comment: '#6D7E88', keyword: '#9AB6B2', parameter: '#6D88BB', function: '#6D88BB', stringExpression: '#789083', punctuation: '#9AB6B2', number: '#BD9C9C', property: '#799DB1' } } },
  meadow: { id: 'meadow', name: 'Meadow', background: { from: '#59D499', to: '#A0872D' }, frame: 'default', syntax: { dark: { foreground: '#FFFFFF', constant: '#E4B165', string: '#E9EB9D', comment: '#708B6C', keyword: '#6DD79F', parameter: '#B3D767', function: '#B3D767', stringExpression: '#E9EB9D', punctuation: '#6DD79F', number: '#46B114', property: '#E4B165' } } },
  midnight: { id: 'midnight', name: 'Midnight', background: { from: '#4CC8C8', to: '#202033' }, frame: 'default', syntax: { dark: { foreground: '#FFFFFF', constant: '#9681C2', string: '#6D86A4', comment: '#4A4C56', keyword: '#7DA9AB', parameter: '#51D0F8', function: '#51D0F8', stringExpression: '#6D86A4', punctuation: '#7DA9AB', number: '#75D2B1', property: '#9681C2' } } },
  raindrop: { id: 'raindrop', name: 'Raindrop', background: { from: '#8EC7FB', to: '#1C55AA' }, frame: 'default', syntax: { dark: { foreground: '#E4F2FF', constant: '#008BB7', string: '#9DD8EB', comment: '#6C808B', keyword: '#2ED9FF', parameter: '#1AD6B5', function: '#1AD6B5', stringExpression: '#9DD8EB', punctuation: '#2ED9FF', number: '#9984EE', property: '#008BB7' } } },
  sunset: { id: 'sunset', name: 'Sunset', background: { from: '#FFCF73', to: '#FF7A2F' }, frame: 'default', syntax: { dark: { foreground: '#FFFFFF', constant: '#E978A1', string: '#F9D38C', comment: '#878572', keyword: '#FFAF65', parameter: '#E2D66B', function: '#E2D66B', stringExpression: '#F9D38C', punctuation: '#FFAF65', number: '#E7CF55', property: '#E978A1' } } },
}

// ---------------------------------------------------------------------------
// Language detection from filename or className
// ---------------------------------------------------------------------------

const EXT_TO_LANG: Record<string, string> = {
  ts: 'tsx', tsx: 'tsx', js: 'javascript', jsx: 'jsx', py: 'python',
  sh: 'bash', bash: 'bash', json: 'json', css: 'css', html: 'html',
  md: 'markdown', yml: 'yaml', yaml: 'yaml', rs: 'rust', go: 'go',
  sql: 'sql', diff: 'diff', swift: 'swift', rb: 'ruby', java: 'java',
  c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', typescript: 'tsx',
  javascript: 'javascript', python: 'python', ruby: 'ruby',
}

function detectLanguage(title?: string, language?: string): string {
  if (language) {
    return EXT_TO_LANG[language.toLowerCase()] || language.toLowerCase()
  }
  if (title) {
    const ext = title.split('.').pop()?.toLowerCase()
    if (ext && EXT_TO_LANG[ext]) return EXT_TO_LANG[ext]
  }
  return 'tsx'
}

// ---------------------------------------------------------------------------
// useHighlightedHtml — async shiki highlighting with state
// ---------------------------------------------------------------------------

function useHighlightedHtml(code: string, lang: string, highlightLines: number[]): string {
  const [html, setHtml] = useState('')
  const { delayRender, continueRender } = useDelayRender()

  // delayRender registered during the first render (useState initializer) and
  // continued only AFTER the highlighted html has been committed to the DOM
  // (layout effect below). Continuing from inside the shiki .then() is too
  // early: React batches the setHtml update, so the renderer could capture the
  // frame between continueRender and the commit, producing an empty block in
  // screenshots/filmstrips/exports.
  const [handle] = useState(() => delayRender('shiki highlight'))
  useLayoutEffect(() => {
    if (html) continueRender(handle)
  }, [html, handle, continueRender])
  // Unmount safety: never leave a dangling handle.
  useLayoutEffect(() => {
    return () => continueRender(handle)
  }, [handle, continueRender])

  useLayoutEffect(() => {
    let cancelled = false

    void getHighlighter().then((h) => {
      if (cancelled) {
        return
      }

      // Load language on demand if not already loaded
      const loaded = h.getLoadedLanguages()
      const langToUse = loaded.includes(lang) ? lang : 'tsx'

      const result = h.codeToHtml(code, {
        lang: langToUse,
        theme: 'css-variables',
        transformers: [{
          line(node: any, line: number) {
            node.properties = node.properties || {}
            node.properties['data-line'] = line
            node.properties.style = (node.properties.style || '') + ';padding:0 16px;margin:0 -16px;display:inline-block;width:calc(100% + 32px);'
            if (highlightLines.includes(line)) {
              node.properties.style += 'background-color:var(--ray-highlight, rgba(255,255,255,0.06));'
              node.properties['class'] = ((node.properties['class'] || '') + ' highlighted-line').trim()
            }
          },
        }],
      })
      if (!cancelled) setHtml(result)
    }).catch(() => {
      continueRender(handle)
    })

    return () => {
      cancelled = true
    }
  }, [code, lang, highlightLines.join(',')])

  return html
}

// ---------------------------------------------------------------------------
// Frame sub-components
// ---------------------------------------------------------------------------

const FONT_SANS = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif'

/** Vercel: gridlines extending beyond the code + corner brackets */
/** Gridlines that extend beyond the code window to the edges of the
 *  nearest overflow:hidden ancestor (the CodeBlock outer container).
 *  Uses large fixed offsets instead of vw/vh so they stay contained
 *  when multiple CodeBlocks sit in a grid. */
function VercelGridlines({ color }: { color: string }) {
  const line = { position: 'absolute' as const, background: color }
  return (
    <>
      <span style={{ ...line, top: 0, left: -9999, width: 99999, height: 1 }} />
      <span style={{ ...line, bottom: 0, left: -9999, width: 99999, height: 1 }} />
      <span style={{ ...line, top: -9999, left: 0, width: 1, height: 99999 }} />
      <span style={{ ...line, top: -9999, right: 0, width: 1, height: 99999 }} />
    </>
  )
}

function VercelBracket({ position, color }: { position: 'top-left' | 'bottom-right'; color: string }) {
  const isTopLeft = position === 'top-left'
  return (
    <span style={{
      position: 'absolute',
      ...(isTopLeft ? { top: -12, left: -12 } : { bottom: -12, right: -12 }),
      width: 25,
      height: 25,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Horizontal bar */}
      <span style={{ position: 'absolute', top: 12, width: '100%', height: 1, background: color }} />
      {/* Vertical bar */}
      <span style={{ position: 'absolute', left: 12, width: 1, height: '100%', background: color }} />
    </span>
  )
}

/** Stripe: dashed vertical gridlines + skewed stripe shape */
function StripeBackground({ gridlineColor, windowWidth }: { gridlineColor: string; windowWidth: number }) {
  const positions = [0, 25, 50, 75, 100]
  const lineStyle = (pct: number, solid?: boolean): CSSProperties => ({
    position: 'absolute',
    top: 0,
    left: `${pct}%`,
    width: 1,
    height: '100%',
    borderLeft: `1px ${solid ? 'solid' : 'dashed'} ${gridlineColor}`,
    pointerEvents: 'none',
  })
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Gridlines */}
      <div style={{ position: 'relative', width: windowWidth, height: '100%', margin: '0 auto' }}>
        {positions.map((pct) => (
          <div key={pct} style={lineStyle(pct, pct === 0 || pct === 100)} />
        ))}
      </div>
      {/* Skewed stripe */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: '100%',
        height: '40%',
        background: 'hsla(213.69, 52%, 97.828%)',
        transform: 'skewY(-6deg)',
        transformOrigin: '100% 0',
      }}>
        <div style={{ position: 'relative', width: windowWidth, height: '100%', margin: '0 auto' }}>
          {positions.map((pct) => (
            <div key={pct} style={{ ...lineStyle(pct, pct === 0 || pct === 100), borderColor: 'rgba(66, 71, 112, 0.15)' }} />
          ))}
          {/* Colored layer bars */}
          <div style={{ position: 'absolute', bottom: 65, left: '75%', width: 500, height: 50 }}>
            <div style={{ position: 'absolute', width: '100%', height: '100%', background: 'rgb(17, 239, 227)' }} />
            <div style={{ position: 'absolute', width: '100%', height: 32, background: 'rgb(153, 102, 255)', transform: 'translate(50px, 50px)' }} />
            <div style={{ position: 'absolute', width: '100%', height: 18, background: 'hsla(221.1, 99.822%, 44.876%)', transform: 'translate(50px, 32px)' }} />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Filename header for Supabase/Cloudflare style */
function FilenameHeader({ title, border, bg, titleColor, fontFamily }: { title: string; border: string; bg: string; titleColor: string; fontFamily: string }) {
  return (
    <div style={{
      display: 'flex',
      height: 40,
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      borderBottom: `1px solid ${border}`,
      background: bg,
      fontFamily,
      fontSize: 14,
      color: titleColor,
    }}>
      <span>{title}</span>
    </div>
  )
}

/** Default frame: macOS traffic lights + title. Matches ray.so DefaultFrame
 *  header: 24px grid with 60px | 1fr | 60px columns, 9px dot gap, no border. */
function DefaultChrome({ title, titleColor }: { title?: string; titleColor: string }) {
  return (
    <div style={{
      display: 'grid',
      height: 24,
      alignItems: 'center',
      padding: '0 16px',
      gap: 12,
      gridTemplateColumns: '60px 1fr 60px',
    }}>
      <div style={{ display: 'flex', gap: 9 }}>
        {['a', 'b', 'c'].map((k) => (
          <div key={k} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(128,128,128,0.2)' }} />
        ))}
      </div>
      <div style={{ textAlign: 'center', color: titleColor, fontSize: 12, fontWeight: 500, letterSpacing: '0.32px', lineHeight: '12px', fontFamily: FONT_SANS, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {title || ''}
      </div>
      <div />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Editor — code display via dangerouslySetInnerHTML
// ---------------------------------------------------------------------------

function CodeEditor({ html, showLineNumbers, lineCount, cssVars, lineNumColor, fontSize, fontFamily, fontWeight }: {
  html: string
  showLineNumbers: boolean
  lineCount: number
  cssVars: CSSProperties
  lineNumColor: string
  fontSize: number
  fontFamily: string
  fontWeight: number
}) {
  // Line number gutter widths computed from fontSize so they scale correctly.
  // A monospace digit is ~0.6em wide; we size the gutter to fit the widest
  // line number plus comfortable spacing.
  // A monospace character is roughly 0.6em wide. Size the gutter to fit the
  // widest line number plus comfortable spacing, all relative to fontSize.
  const ch = Math.ceil(fontSize * 0.62)
  const gutterDigits = lineCount > 99 ? 3 : 2
  const gutterWidth = ch * (gutterDigits + 1)          // extra ch for breathing room
  const gutterGap = Math.round(fontSize * 0.8)         // space between number and code
  const gutterTotal = gutterWidth + gutterGap

  const lineNumberCss = showLineNumbers ? `
    .shiki code .line { padding-left: ${gutterTotal}px !important; }
    .shiki code .line::before {
      content: attr(data-line);
      display: inline-block;
      width: ${gutterWidth}px;
      margin-right: ${gutterGap}px;
      margin-left: -${gutterTotal}px;
      color: ${lineNumColor};
      text-align: right;
    }
  ` : ''

  const editorCss = `
    .shiki { margin: 0; background-color: transparent !important; font-family: inherit; white-space: pre-wrap; }
    .shiki code { font-family: inherit; }
    .shiki code .line { transition: width 0.2s, padding 0.2s, margin 0.2s; }
    .highlighted-line { position: relative; }
    .highlighted-line::after {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: -1px;
      width: 2px;
      background-color: var(--ray-highlight-border, var(--ray-token-keyword));
    }
    ${lineNumberCss}
  `

  return (
    <div style={{
      padding: 16,
      fontFamily,
      fontWeight,
      fontSize,
      lineHeight: 1.7,
      letterSpacing: '0.1px',
      tabSize: 2,
      fontVariantLigatures: 'none',
      ...cssVars,
    }}>
      <style dangerouslySetInnerHTML={{ __html: editorCss }} />
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// CodeBlock component
// ---------------------------------------------------------------------------

export interface CodeBlockProps {
  children?: ReactNode
  theme?: string
  darkMode?: boolean
  title?: string
  language?: string
  showLineNumbers?: boolean
  highlightLines?: number[]
  padding?: number
  fontSize?: number
  width?: number | string
  height?: number | string
  showBackground?: boolean
  staggerFrames?: number
}

export function CodeBlock({
  children,
  theme: themeId = 'vercel',
  darkMode = true,
  title,
  language,
  showLineNumbers = false,
  highlightLines = [],
  padding = 32,
  fontSize = 15,
  width = 780,
  height,
  showBackground = true,
  staggerFrames = 0,
}: CodeBlockProps) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  const tp = useTweakpane('CodeBlock', {
    theme: { value: themeId, options: Object.keys(CODE_THEMES).sort() },
    darkMode,
    showLineNumbers,
    showBackground,
    fontSize: { value: fontSize, min: 8, max: 32, step: 1 },
    padding: { value: padding, min: 0, max: 80, step: 4 },
  })

  const resolvedThemeId = tp.theme
  const themeData = (CODE_THEMES[resolvedThemeId] ?? CODE_THEMES.vercel)!
  const fc = themeData.frameColors || {}

  // Resolve dark/light mode
  const hasDark = !!themeData.syntax.dark
  const hasLight = !!themeData.syntax.light
  const effectiveDark = hasDark && !hasLight ? true : hasLight && !hasDark ? false : tp.darkMode
  const colors = (effectiveDark ? themeData.syntax.dark : themeData.syntax.light)!
  const cssVars = syntaxToCssVars(colors)

  // Extract code and highlight
  const code = extractCodeString(children)
  const lines = code.split('\n')
  const lang = detectLanguage(title, language)
  const html = useHighlightedHtml(code, lang, highlightLines)

  // Entrance animation
  const windowScale = staggerFrames > 0
    ? spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
    : 1
  const windowOpacity = staggerFrames > 0
    ? interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' })
    : 1

  // Frame-specific colors
  const frameBg = effectiveDark ? (fc.frameBg || 'transparent') : (fc.frameBgLight || 'transparent')
  const windowBg = effectiveDark ? (fc.windowBg || 'rgba(0, 0, 0, 0.88)') : (fc.windowBgLight || 'rgba(255, 255, 255, 0.95)')
  const borderColor = effectiveDark ? (fc.border || 'rgba(255,255,255,0.08)') : (fc.borderLight || 'rgba(0,0,0,0.08)')
  const lineNumColor = effectiveDark ? (fc.lineNumber || 'rgba(255,255,255,0.2)') : (fc.lineNumberLight || 'rgba(0,0,0,0.2)')
  const gridlineColor = effectiveDark ? (fc.gridline || '#1a1a1a') : (fc.gridlineLight || '#ebebeb')
  const headerBg = effectiveDark ? (fc.headerBg || windowBg) : (fc.headerBgLight || windowBg)
  const titleColor = effectiveDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'

  // Background: either theme gradient or frame-specific solid
  const outerBg = tp.showBackground
    ? (themeData.frame === 'default'
      ? `linear-gradient(140deg, ${themeData.background.from}, ${themeData.background.to})`
      : frameBg)
    : 'transparent'

  const outerWidth = typeof width === 'number' ? width + tp.padding * 2 : width
  const outerHeight = height ? (typeof height === 'number' ? height + tp.padding * 2 : height) : undefined

  const editorEl = (
    <CodeEditor
      html={html}
      showLineNumbers={tp.showLineNumbers}
      lineCount={lines.length}
      cssVars={cssVars}
      lineNumColor={lineNumColor}
      fontSize={tp.fontSize}
      fontFamily={CODE_FONT}
      fontWeight={CODE_FONT_WEIGHT}
    />
  )

  function renderFrame() {
    switch (themeData.frame) {
      case 'vercel':
        return (
          <div style={{ position: 'relative' }}>
            <VercelGridlines color={gridlineColor} />
            <VercelBracket position="top-left" color="#515356" />
            <VercelBracket position="bottom-right" color="#515356" />
            {editorEl}
          </div>
        )

      case 'stripe':
        return (
          <>
            {tp.showBackground && (
              <StripeBackground gridlineColor={fc.gridline || 'rgba(255,255,255,0.1)'} windowWidth={typeof width === 'number' ? width : 780} />
            )}
            <div style={{
              position: 'relative',
              zIndex: 1,
              border: `1px solid ${borderColor}`,
              borderRadius: 8,
              background: windowBg,
              boxShadow: 'rgba(50, 50, 93, 0.25) 0px 50px 100px -20px, rgba(0, 0, 0, 0.3) 0px 30px 60px -30px',
            }}>
              {editorEl}
            </div>
          </>
        )

      case 'openai':
        return (
          <div style={{
            position: 'relative',
            zIndex: 1,
            border: `0.5px solid ${borderColor}`,
            borderRadius: 8,
            background: windowBg,
            boxShadow: '0px 100px 89px 0px rgba(0,0,0,0.07), 0px 41.778px 37.182px 0px rgba(0,0,0,0.05), 0px 22.336px 19.879px 0px rgba(0,0,0,0.04), 0px 12.522px 11.144px 0px rgba(0,0,0,0.04), 0px 6.65px 5.919px 0px rgba(0,0,0,0.03), 0px 2.767px 2.463px 0px rgba(0,0,0,0.02)',
          }}>
            {editorEl}
          </div>
        )

      case 'supabase':
        return (
          <div style={{
            border: `1px solid ${borderColor}`,
            borderRadius: 6,
            background: windowBg,
            overflow: 'hidden',
          }}>
            {title && <FilenameHeader title={title} border={borderColor} bg={headerBg} titleColor={effectiveDark ? '#fafafa' : '#171717'} fontFamily={CODE_FONT} />}
            {editorEl}
          </div>
        )

      case 'cloudflare':
        return (
          <div style={{ position: 'relative' }}>
            <VercelGridlines color={gridlineColor} />
            <div style={{ position: 'relative', background: windowBg }}>
              {title && <FilenameHeader title={title} border={gridlineColor} bg={headerBg} titleColor={effectiveDark ? '#ededed' : 'oklch(14.5% 0 0)'} fontFamily={CODE_FONT} />}
              {editorEl}
            </div>
          </div>
        )

      case 'default':
      default: {
        // ray.so uses box-shadow borders (not CSS border) + multi-layer shadow
        const shadowBorder = effectiveDark
          ? '0 0 0 1px rgba(255,255,255,0.06), 0 0 0 1.5px rgba(0,0,0,0.4)'
          : '0 0 0 1px rgba(0,0,0,0.04), 0 0 0 1.5px rgba(0,0,0,0.08)'
        const dropShadow = tp.showBackground
          ? ', 0 2.8px 2.2px rgba(0,0,0,0.034), 0 6.7px 5.3px rgba(0,0,0,0.048), 0 12.5px 10px rgba(0,0,0,0.06), 0 22.3px 17.9px rgba(0,0,0,0.072), 0 41.8px 33.4px rgba(0,0,0,0.086), 0 100px 80px rgba(0,0,0,0.12)'
          : ''
        return (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: 100,
            paddingTop: 10,
            borderRadius: 18,
            background: windowBg,
            overflow: 'hidden',
            boxShadow: shadowBorder + dropShadow,
          }}>
            <DefaultChrome title={title} titleColor={titleColor} />
            {editorEl}
          </div>
        )
      }
    }
  }

  return (
    <CodeBlockContext.Provider value={true}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: tp.padding,
        background: outerBg,
        borderRadius: tp.showBackground ? (themeData.frame === 'default' ? 18 : 0) : 0,
        width: outerWidth,
        height: outerHeight,
        transform: `scale(${windowScale})`,
        opacity: windowOpacity,
        overflow: 'hidden',
        position: 'relative',
      }}>
        {renderFrame()}
      </div>
    </CodeBlockContext.Provider>
  )
}

// ---------------------------------------------------------------------------
// Helper: extract code string from React children
// ---------------------------------------------------------------------------

function extractCodeString(children: ReactNode): string {
  if (typeof children === 'string') return children.trimEnd()
  if (children == null) return ''
  if (typeof children === 'object' && 'props' in (children as any)) {
    const el = children as any
    if (el.props?.children != null) return extractCodeString(el.props.children)
  }
  if (Array.isArray(children)) return children.map(extractCodeString).join('')
  return String(children).trimEnd()
}

// ---------------------------------------------------------------------------
// MDX code block wrapper
// ---------------------------------------------------------------------------

export function MdxCodeBlockWrapper({
  children,
  ...rest
}: { children?: ReactNode } & Record<string, any>) {
  const isNested = useContext(CodeBlockContext)
  if (isNested) return <pre {...rest}>{children}</pre>

  let language: string | undefined
  if (children && typeof children === 'object' && 'props' in (children as any)) {
    const className = (children as any).props?.className
    if (typeof className === 'string') {
      const match = className.match(/language-(\w+)/)
      if (match) language = match[1]
    }
  }

  return (
    <div style={{ width: '100%', maxWidth: '80%', display: 'flex', justifyContent: 'center' }}>
      <CodeBlock
        title={language || undefined}
        language={language}
        width="100%"
        showBackground={false}
        showLineNumbers
      >
        {children}
      </CodeBlock>
    </div>
  )
}
