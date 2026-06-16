/**
 * <Server> MDX parsing utilities.
 *
 * <Server> is a reserved MDX element marking a subtree as React Server
 * Components. This module contains the pure parsing logic shared by the
 * server (app.tsx), the client (mdx-client.tsx), and the vite plugin:
 *
 * - findServerNodes: locate <Server> elements, keyed by start line
 * - blankServerContents: strip server content from the client-facing MDX
 *   string while preserving line positions
 * - collectServerImportSources: detect which MDX imports <Server> blocks
 *   need (app.tsx dynamically imports them at request time)
 * - filterImportNodesToModules: per-statement import filtering against an
 *   environment's modules map
 *
 * Environment-neutral: no remotion, react, or node-only imports.
 */

import { resolveModulePath } from 'safe-mdx/parse'

// Inline mdast type to avoid requiring @types/mdast as a dependency
type RootContent = any

// ---------------------------------------------------------------------------
// <Server> slot extraction
//
// The server (app.tsx) renders each Server node's children in the RSC
// environment and passes the resulting JSX to the client keyed by the
// node's start line. The client (mdx-client.tsx) has a real `Server`
// component in its components map that reads ServerSlotsContext and
// matches its slot via the data-markdown-line prop safe-mdx injects.
// ---------------------------------------------------------------------------

export interface ServerNode {
  /** Slot key: the node's start LINE as a string. Stable across server
   *  and client because both parse the same source string
   *  (blankServerContents preserves all line positions). Line-only (no
   *  column) because the client matches slots via the data-markdown-line
   *  prop that safe-mdx injects, which only carries the line. Two <Server>
   *  elements on the same line collide — app.tsx warns about duplicates. */
  key: string
  node: RootContent
}

function serverNodeKey(node: RootContent): string {
  return String(node.position?.start?.line)
}

/** Recursively find <Server> elements in the mdast. Server nodes nested
 *  inside another <Server> are skipped — the outer slot covers them. */
export function findServerNodes(mdast: { children?: RootContent[] }): ServerNode[] {
  const found: ServerNode[] = []
  const visit = (node: RootContent) => {
    const isServer =
      (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement')
      && node.name === 'Server'
    if (isServer) {
      found.push({ key: serverNodeKey(node), node })
      return // don't descend — nested Server is part of the outer slot
    }
    for (const child of node.children || []) visit(child)
  }
  for (const child of mdast.children || []) visit(child)
  return found
}

/** Replace each <Server> element's source range with a self-closing
 *  `<Server />` marker, padded with newlines so the result has the EXACT
 *  same line count and all subsequent positions stay valid. This keeps
 *  slot keys, data-markdown-line attributes, and sourcemaps aligned with
 *  the original file, and prevents the client from parsing (and trying to
 *  resolve imports for) server-only content. */
export function blankServerContents(source: string, serverNodes: ServerNode[]): string {
  // Process back-to-front so earlier offsets stay valid after each splice.
  const sorted = [...serverNodes].sort(
    (a, b) => (b.node.position?.start?.offset ?? 0) - (a.node.position?.start?.offset ?? 0),
  )
  let result = source
  for (const { node } of sorted) {
    const start = node.position?.start?.offset
    const end = node.position?.end?.offset
    if (typeof start !== 'number' || typeof end !== 'number') continue
    const span = result.slice(start, end)
    const newlines = span.split('\n').length - 1
    const replacement = '<Server />' + '\n'.repeat(newlines)
    result = result.slice(0, start) + replacement + result.slice(end)
  }
  return result
}

// ---------------------------------------------------------------------------
// Server import detection
//
// Detects which MDX imports are needed by <Server> slot rendering by
// scanning identifier usage inside <Server> subtrees. app.tsx dynamically
// imports exactly these sources at request time — no filename convention
// required (though *.server.* remains supported as a hard "never bundle
// to the browser" override in the vite plugin).
//
// Detection is name-based and intentionally COARSE: it collects JSX
// element names (root identifier of <ns.Comp/>) plus every estree
// Identifier in expressions and attribute values. Over-collection just
// imports an extra file server-side; under-collection would break slot
// rendering, so coarse is the safe direction.
// ---------------------------------------------------------------------------

/** Collect every estree Identifier name reachable from a value. */
function collectEstreeIdentifiers(value: any, out: Set<string>) {
  if (!value || typeof value !== 'object') return
  if (Array.isArray(value)) {
    for (const item of value) collectEstreeIdentifiers(item, out)
    return
  }
  if (value.type === 'Identifier' && typeof value.name === 'string') {
    out.add(value.name)
  }
  for (const key of Object.keys(value)) {
    if (key === 'position' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') continue
    collectEstreeIdentifiers(value[key], out)
  }
}

/** Collect identifier usage from a single mdast node into a bucket:
 *  JSX element names plus identifiers in expressions/attribute values. */
function collectNodeIdentifiers(node: any, out: Set<string>) {
  if (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') {
    if (typeof node.name === 'string' && node.name) {
      out.add(node.name.split('.')[0]!)
    }
    for (const attr of node.attributes || []) {
      if (attr.type === 'mdxJsxExpressionAttribute') {
        collectEstreeIdentifiers(attr.data?.estree, out)
      } else if (attr.value && typeof attr.value === 'object') {
        collectEstreeIdentifiers(attr.value.data?.estree, out)
      }
    }
  }
  if (node.type === 'mdxFlowExpression' || node.type === 'mdxTextExpression') {
    collectEstreeIdentifiers(node.data?.estree, out)
  }
}

/** Collect MDX import sources whose names are used inside <Server>
 *  subtrees. Includes bare specifiers (e.g. 'egaki/text-to-speech') —
 *  app.tsx imports them through vite's resolver, and the resolved file's
 *  'use client' directive (or lack of it) decides whether the exports are
 *  client refs or server components. */
export function collectServerImportSources(mdast: { children?: RootContent[] }): string[] {
  const insideNames = new Set<string>()

  const visit = (node: RootContent, insideServer: boolean) => {
    const isServer =
      (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement')
      && node.name === 'Server'
    const nowInside = insideServer || isServer
    if (nowInside && !isServer) {
      // The <Server> element itself contributes no identifiers.
      collectNodeIdentifiers(node, insideNames)
    }
    for (const child of node.children || []) visit(child, nowInside)
  }
  for (const child of mdast.children || []) visit(child, false)

  const sources = new Set<string>()
  for (const node of mdast.children || []) {
    if (node.type !== 'mdxjsEsm') continue
    const body = node.data?.estree?.body || []
    for (const stmt of body) {
      if (stmt.type !== 'ImportDeclaration') continue
      const source = stmt.source?.value
      if (typeof source !== 'string') continue
      const locals: string[] = (stmt.specifiers || [])
        .map((s: any) => s.local?.name)
        .filter(Boolean)
      if (locals.some((name) => insideNames.has(name))) sources.add(source)
    }
  }
  return [...sources].sort()
}

// ---------------------------------------------------------------------------
// Auto-wrap generated media components in <Server>
//
// <GeneratedImage>, <GeneratedVideo>, <GeneratedSpeech> are server components
// that call egaki's generation APIs. When found bare in the mdast (not inside
// a <Server> block), this transform wraps them in a synthetic <Server> node
// so findServerNodes() picks them up. The wrapper reuses the original node's
// position so line numbers stay stable and no sourcemap fixup is needed.
// ---------------------------------------------------------------------------

/** Component names that should be auto-wrapped in <Server>. */
export const GENERATED_COMPONENT_NAMES = new Set([
  'GeneratedImage',
  'GeneratedVideo',
  'GeneratedSpeech',
])

/** Walk the mdast and wrap bare generated media components in <Server>.
 *  Mutates the tree in place. Wrapping reuses the original node's position
 *  so slot keys and line numbers are unchanged. */
export function wrapGenerateNodes(mdast: { children?: RootContent[] }): void {
  const wrapInParent = (parent: { children?: RootContent[] }) => {
    if (!parent.children) return
    for (let i = 0; i < parent.children.length; i++) {
      const node = parent.children[i]
      const isGenerate =
        (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement')
        && GENERATED_COMPONENT_NAMES.has(node.name)
      if (isGenerate) {
        // Wrap in a synthetic <Server> with the same position so slot
        // keying (by start line) stays identical and blankServerContents
        // replaces the right source span.
        parent.children[i] = {
          type: node.type,
          name: 'Server',
          attributes: [],
          children: [node],
          position: node.position ? { ...node.position } : undefined,
        }
        continue
      }
      // Don't descend into <Server> — already server-side
      const isServer =
        (node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement')
        && node.name === 'Server'
      if (isServer) continue
      // Recurse into other elements
      if (node.children) wrapInParent(node)
    }
  }
  wrapInParent(mdast)
}

/** Filter mdxjsEsm import nodes to statements whose source is resolvable
 *  in the given modules map. Each environment's map only contains the
 *  modules that belong there, so this keeps exactly the imports that
 *  environment can satisfy — no naming rules. Filtering is per-STATEMENT:
 *  contiguous import lines parse as a single mdxjsEsm node, so dropping
 *  whole nodes would remove unrelated imports. */
export function filterImportNodesToModules(
  importNodes: RootContent[],
  moduleKeys: string[],
): RootContent[] {
  return importNodes.map((node: any) => {
    const estree = node.data?.estree
    if (!estree?.body) return node
    const body = estree.body.filter((stmt: any) => {
      if (stmt.type !== 'ImportDeclaration') return true
      const source = stmt.source?.value
      if (typeof source !== 'string') return true
      return resolveModulePath(source, './', moduleKeys) !== undefined
    })
    if (body.length === estree.body.length) return node
    return { ...node, data: { ...node.data, estree: { ...estree, body } } }
  })
}
