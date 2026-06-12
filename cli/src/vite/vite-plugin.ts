/**
 * Vite plugin for the video framework.
 *
 * Accepts a single MDX entry file, generates virtual modules for the
 * spiceflow app entry, and auto-injects spiceflow + react plugins.
 *
 * Usage in vite.config.ts:
 *   import { video } from 'egaki/vite'
 *   export default defineConfig({ plugins: [video({ entry: './video.mdx' })] })
 */

import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin, PluginOption } from 'vite'
import { spiceflowPlugin } from 'spiceflow/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Resolve the package src/ directory from this file's location.
// Used for resolve.alias so the RSC module runner can resolve relative
// imports from app.tsx (same pattern as egaki/vite).
const __srcDir = fileURLToPath(new URL('.', import.meta.url))
const APP_SRC_PATH = path.join(__srcDir, 'app.tsx')

const VIRTUAL_APP = 'virtual:egaki-app'
const RESOLVED_APP = '\0' + VIRTUAL_APP

const VIRTUAL_MDX = 'virtual:egaki-mdx'
const RESOLVED_MDX = '\0' + VIRTUAL_MDX

const VIRTUAL_MODULES = 'virtual:egaki-modules'
const RESOLVED_MODULES = '\0' + VIRTUAL_MODULES

const PKG_NAME = 'egaki'

export interface VideoPluginOptions {
  /** Path to the MDX entry file (relative to vite root or absolute) */
  entry: string
}

export function video(options: VideoPluginOptions): PluginOption[] {
  let root: string
  let entryPath: string

  const videoPlugin: Plugin = {
    name: 'egaki:core',

    configResolved(config) {
      root = config.root
      entryPath = path.isAbsolute(options.entry)
        ? options.entry
        : path.resolve(root, options.entry)

      if (!fs.existsSync(entryPath)) {
        throw new Error(
          `[egaki] entry file not found: ${entryPath}\n` +
          `Set entry to a path relative to the vite root.`,
        )
      }
    },

    resolveId(id) {
      if (id === VIRTUAL_APP) return RESOLVED_APP
      if (id === VIRTUAL_MDX) return RESOLVED_MDX
      if (id === VIRTUAL_MODULES) return RESOLVED_MODULES
    },

    load(id) {
      if (id === RESOLVED_MDX) {
        // Import the user's MDX file as a raw string.
        // Vite's ?raw handles HMR automatically.
        // Use absolute path so the virtual module resolves correctly.
        const absEntry = entryPath.replace(/\\/g, '/')
        return `import mdx from ${JSON.stringify(absEntry + '?raw')}\nexport default mdx`
      }

      if (id === RESOLVED_MODULES) {
        // Build an eager module map for all .tsx/.jsx files in the user's
        // project root. Each file is imported statically so modules are
        // available synchronously — no async resolution, no loading state.
        const imports: string[] = []
        const entries: string[] = []
        let i = 0
        const walkDir = (dir: string) => {
          if (!fs.existsSync(dir)) return
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'e2e' || entry.name === 'test-results' || entry.name.startsWith('.')) continue
            const fullPath = path.join(dir, entry.name)
            if (entry.isDirectory()) {
              walkDir(fullPath)
            } else if (/\.(tsx?|jsx?|mdx?)$/.test(entry.name) && !/\.(test|spec|config)\./.test(entry.name)) {
              // Skip the main entry file to avoid circular imports
              if (fullPath === entryPath) continue
              const isMdx = /\.mdx?$/.test(entry.name)
              const relPath = './' + path.relative(root, fullPath).replace(/\\/g, '/')
              const absPath = fullPath.replace(/\\/g, '/')
              const varName = `__mod${i++}`
              if (isMdx) {
                // MDX/MD files loaded as raw strings for server-side rendering
                imports.push(`import ${varName} from ${JSON.stringify(absPath + '?raw')}`)
                entries.push(`  ${JSON.stringify(relPath)}: { default: ${varName} }`)
              } else {
                imports.push(`import * as ${varName} from ${JSON.stringify(absPath)}`)
                entries.push(`  ${JSON.stringify(relPath)}: ${varName}`)
              }
            }
          }
        }
        walkDir(root)

        // No self-accept here: mdx-client.tsx accepts updates of this
        // module via import.meta.hot.accept('virtual:egaki-modules', cb).
        // When a user file changes, HMR propagates through this module to
        // that boundary, re-executing this module with fresh imports and
        // handing the new map to the callback. Self-accepting here would
        // make THIS module the boundary and the importer callback would
        // never fire.
        return [
          ...imports,
          `export const eagerModules = {`,
          entries.join(',\n'),
          `}`,
        ].join('\n')
      }

      if (id === RESOLVED_APP) {
        // Spiceflow entry: import the framework's app from its absolute
        // source path so the RSC module runner resolves relative imports
        // (./mdx-parse.ts etc.) from the correct filesystem directory.
        return [
          `import { app } from ${JSON.stringify(APP_SRC_PATH)}`,
          `export { app }`,
        ].join('\n')
      }
    },

    // HMR for file changes in the project.
    //
    // Entry MDX: the source string flows server → client through the RSC
    // flight payload, so invalidate the virtual modules in all envs and
    // send rsc:update to re-fetch the flight.
    //
    // User .tsx/.ts/.mdx/.css files: handled entirely in the client module
    // graph. Component files get React Fast Refresh; data/raw-mdx updates
    // propagate to virtual:egaki-modules which self-accepts and dispatches
    // a fresh modules map (see load() above). On rsc/ssr envs we invalidate
    // the changed modules manually and return [] to suppress default HMR,
    // which would trigger an SSR "program reload" → full page reload.
    //
    // File create/delete: the generated module list changed and no accept
    // chain exists for new files, so invalidate everything + full reload.
    hotUpdate(ctx) {
      const isEntryMdx = ctx.file === entryPath
      const isImportedMdx = /\.mdx?$/.test(ctx.file)
        && ctx.file !== entryPath
        && !ctx.file.includes('node_modules')
        && ctx.file.startsWith(root)
      const isUserFile = /\.[jt]sx?$/.test(ctx.file)
        && !ctx.file.includes('node_modules')
        && ctx.file.startsWith(root)
      const isCss = /\.css$/.test(ctx.file)
        && !ctx.file.includes('node_modules')
        && ctx.file.startsWith(root)

      if (!isEntryMdx && !isImportedMdx && !isUserFile && !isCss) return

      const invalidateVirtual = (ids: string[]) => {
        for (const env of Object.values(ctx.server.environments)) {
          for (const resolvedId of ids) {
            const mod = env.moduleGraph.getModuleById(resolvedId)
            if (mod) {
              env.moduleGraph.invalidateModule(mod)
            }
          }
        }
      }

      // Create/delete: regenerate module list, full reload.
      if (ctx.type !== 'update') {
        invalidateVirtual([RESOLVED_APP, RESOLVED_MDX, RESOLVED_MODULES])
        if (this.environment.name === 'client') {
          ctx.server.environments.client?.hot.send({ type: 'full-reload' })
        }
        return []
      }

      if (isEntryMdx) {
        invalidateVirtual([RESOLVED_APP, RESOLVED_MDX])
        // Send rsc:update so the client re-fetches the RSC payload
        if (this.environment.name === 'client') {
          ctx.server.environments.client?.hot.send({
            type: 'custom',
            event: 'rsc:update',
            data: { file: ctx.file },
          })
        }
        return []
      }

      // User file / imported MDX / CSS updates.
      // Client env: let default HMR run (Fast Refresh for components,
      // propagation to the self-accepting virtual module for the rest).
      if (this.environment.name === 'client') {
        return
      }

      // rsc/ssr envs: keep graphs fresh for the next cold render, but
      // suppress default HMR (would cause a full program reload).
      invalidateVirtual([RESOLVED_MODULES])
      for (const mod of ctx.modules) {
        this.environment.moduleGraph.invalidateModule(mod)
      }
      return []
    },
  }

  // Keep the video package inside the RSC/SSR transform pipeline
  const rscPackagePlugin: Plugin = {
    name: 'egaki:rsc-package',
    configEnvironment(name, config) {
      // noExternal: keep package in transform pipeline for all environments
      config.resolve ??= {}
      const existing = config.resolve.noExternal
      if (existing === true) return
      const arr = Array.isArray(existing) ? existing : existing ? [existing] : []
      arr.push(new RegExp(`^${PKG_NAME}`))
      config.resolve.noExternal = arr

      if (name === 'client') {
        config.optimizeDeps ??= {}
        config.optimizeDeps.exclude = mergeUnique(
          config.optimizeDeps.exclude,
          [PKG_NAME],
        )
        config.optimizeDeps.include = mergeUnique(
          config.optimizeDeps.include,
          [
            `${PKG_NAME} > spiceflow > @vitejs/plugin-rsc/vendor/react-server-dom/client.browser`,
            `${PKG_NAME} > remotion`,
            `${PKG_NAME} > @remotion/player`,
            `${PKG_NAME} > safe-mdx`,
          ],
        )
      }

      if (name === 'rsc' || name === 'ssr') {
        config.optimizeDeps ??= {}
        config.optimizeDeps.exclude = mergeUnique(
          config.optimizeDeps.exclude,
          ['spiceflow'],
        )
      }
    },
  }

  return [
    videoPlugin,
    rscPackagePlugin,
    tailwindcss(),
    spiceflowPlugin({ entry: VIRTUAL_APP }),
    react(),
  ]
}

function mergeUnique(existing: string[] | undefined, items: string[]): string[] {
  const set = new Set(existing ?? [])
  for (const item of items) set.add(item)
  return [...set]
}
