/**
 * Spiceflow entry for the video framework.
 *
 * The server has two jobs:
 *
 * 1. Deliver the MDX source string to the client through the RSC flight
 *    payload. All regular MDX processing (parsing, section splitting,
 *    expression evaluation, safe-mdx rendering) happens in the browser
 *    inside MdxClientApp (mdx-client.tsx, 'use client'), so MDX expression
 *    props can be functions and user components don't need 'use client'.
 *
 * 2. Render <Server> slots. <Server> is a reserved MDX element marking a
 *    subtree as server components: its children are rendered HERE in the
 *    RSC environment (async allowed, promises stream through flight) and
 *    passed to the client as serverSlots keyed by the node's start
 *    position. The MDX string sent to the client has each <Server> block
 *    blanked to a self-closing marker with newline padding, so every
 *    position (slot keys, data-markdown-line, sourcemaps) stays aligned
 *    with the original file and the client never parses server-only
 *    content.
 *
 * NOTE: Relative imports MUST include file extensions (.tsx, .ts) for the
 * RSC module runner to resolve them correctly within noExternal packages.
 */

import path from 'node:path'
import { createRequire } from 'node:module'
import type { ReactNode } from 'react'
import { Spiceflow } from 'spiceflow'
import { SafeMdxRenderer } from 'safe-mdx'
import { mdxParse } from 'safe-mdx/parse'
import type { EagerModules } from 'safe-mdx/parse'
import mdxSource, { projectRoot, entryPath } from 'virtual:egaki-mdx'
import {
  findServerNodes,
  blankServerContents,
  collectServerImportSources,
  filterImportNodesToModules,
  wrapGenerateNodes,
} from './server-mdx.ts'
import { MdxClientApp } from './mdx-client.tsx'
import { MDX_BUILTIN_COMPONENTS } from './mdx-video.tsx'
import {
  GeneratedImage,
  GeneratedVideo,
  GeneratedSpeech,
} from './server-components.tsx'

/** Dynamically import the modules referenced inside <Server> blocks.
 *  No static module map and no manual file probing: vite's RSC module
 *  runner routes dynamic imports through vite's own resolver, which
 *  handles extensionless relative paths AND bare package specifiers
 *  (e.g. 'egaki/text-to-speech'). The resolved file's 'use client'
 *  directive decides whether exports are client refs or server
 *  components. Map keys are the import sources as written so safe-mdx
 *  resolves them directly. */
async function importServerModules(ast: any): Promise<EagerModules> {
  // Bare specifiers must be resolved to absolute file paths BEFORE the
  // dynamic import: the runner handles runtime-computed file paths, but
  // bare specifiers fall through to node's native loader, which cannot
  // load .tsx package sources. createRequire from the project root walks
  // node_modules + package exports the same way vite's resolver would.
  const requireFromRoot = createRequire(path.join(projectRoot, 'package.json'))

  const modules: EagerModules = {}
  for (const source of collectServerImportSources(ast)) {
    if (/\.mdx?$/.test(source)) {
      console.warn(`[egaki] imported .mdx files inside <Server> are not supported yet: ${source}`)
      continue
    }
    try {
      const isPathLike = source.startsWith('.') || source.startsWith('/')
      const id = isPathLike
        ? path.resolve(projectRoot, source)
        : requireFromRoot.resolve(source)
      // @vite-ignore: runtime-computed path; the RSC module runner
      // rewrites dynamic imports and resolves file paths through the
      // vite transform pipeline regardless of static analyzability.
      modules[source] = await import(/* @vite-ignore */ id)
    } catch (e) {
      console.warn(`[egaki] failed to import <Server> module ${source}:`, (e as Error).message)
    }
  }
  return modules
}

export const app = new Spiceflow()
  .page('/', async () => {
    const ast = mdxParse(mdxSource)
    // Auto-wrap <GeneratedImage>, <GeneratedVideo>, <GeneratedSpeech> in
    // <Server> so they render server-side without manual wrapping in MDX.
    wrapGenerateNodes(ast)
    const serverNodes = findServerNodes(ast)

    if (serverNodes.length === 0) {
      return <MdxClientApp mdx={mdxSource} serverSlots={{}} entryPath={entryPath} />
    }

    const eagerModules = await importServerModules(ast)

    // Import nodes (mdxjsEsm) are needed by SafeMdxRenderer to resolve
    // user components inside each slot. Keep only statements resolvable
    // in the server modules map — anything else would just produce
    // missing-module warnings.
    const importNodes = filterImportNodesToModules(
      ast.children.filter((node: any) => node.type === 'mdxjsEsm'),
      Object.keys(eagerModules),
    )

    // Override client stubs with real server components for generated
    // media. The client stubs in MDX_BUILTIN_COMPONENTS return null;
    // the server versions call egaki's generation APIs and return
    // client wrappers with streaming promises.
    const serverComponents = {
      ...MDX_BUILTIN_COMPONENTS,
      GeneratedImage,
      GeneratedVideo,
      GeneratedSpeech,
    }

    const serverSlots: Record<string, ReactNode> = {}
    for (const { key, node } of serverNodes) {
      if (key in serverSlots) {
        console.warn(
          `[egaki] multiple <Server> elements start on line ${key}; ` +
          `only the first one renders. Put each <Server> on its own line.`,
        )
        continue
      }
      serverSlots[key] = (
        <SafeMdxRenderer
          markdown={mdxSource}
          mdast={{ type: 'root', children: [...importNodes, ...node.children] } as any}
          components={serverComponents}
          modules={eagerModules}
          baseUrl="./"
          onError={(e) => console.warn('[egaki] <Server> slot:', e.message)}
        />
      )
    }

    const clientMdx = blankServerContents(mdxSource, serverNodes)
    return <MdxClientApp mdx={clientMdx} serverSlots={serverSlots} entryPath={entryPath} />
  })
