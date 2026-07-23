// Zero-config dev server for egaki MDX videos.
//
// `egaki dev video.mdx` boots a Vite dev server with inline config
// (configFile: false) — no package.json, vite.config.ts, or npm install
// needed in the user's folder.
//
// Dependency resolution: when the folder has no usable node_modules, a
// shim node_modules is created containing symlinks to egaki itself and
// every egaki dependency (react, remotion, vite, ...) resolved from the
// CLI's own installation. A plain fallback resolveId plugin is NOT enough
// because Vite's dep optimizer resolves optimizeDeps.include entries with
// an internal resolver (alias + vite:resolve only) that skips user
// plugins — without real node_modules those includes fail and CJS deps
// like safe-mdx break in the browser. The shim makes standard node
// resolution work everywhere (vite:resolve, optimizer, tailwind scans).
// The shim dir contains a .egaki-shim marker so it can be refreshed
// idempotently and recognized as CLI-owned.
//
// Vite's cache dir is placed under ~/.cache/egaki/vite/<hash> so repeated
// runs reuse the prebundle without polluting the user's folder further.

import fs from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { ViteDevServer } from 'vite'
import { video } from '../vite/vite-plugin.ts'

// Package root: this file runs from src/cli/ (dev) or dist/cli/ (published).
// Going up 2 levels reaches the egaki package root either way.
const __pkgRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const egakiRequire = createRequire(path.join(__pkgRoot, 'package.json'))

const SHIM_MARKER = '.egaki-shim'

export interface StartDevServerOptions {
  /** Path to an .mdx entry file, or a directory containing .mdx files.
   *  Defaults to the current working directory (auto-discovers video.mdx
   *  > index.mdx > first .mdx alphabetically). */
  entry?: string
  /** Fixed port. When omitted, a random free port is chosen. */
  port?: number
  /** Host to bind. Defaults to localhost. */
  host?: string
}

export interface RunningDevServer {
  url: string
  port: number
  root: string
  server: ViteDevServer
  close: () => Promise<void>
}

/** Find a random free TCP port by binding to port 0. */
export async function findFreePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer()
    probe.once('error', reject)
    probe.listen(0, host, () => {
      const address = probe.address() as net.AddressInfo
      probe.close(() => resolve(address.port))
    })
  })
}

/** Locate the real directory of a package installed in egaki's own tree.
 *  Tries pkg/package.json first (works for most packages), then falls
 *  back to resolving the main entry and walking up to the package root
 *  (for packages whose exports map hides ./package.json). */
function packageDirFromEgaki(pkg: string): string | undefined {
  try {
    return path.dirname(fs.realpathSync(egakiRequire.resolve(`${pkg}/package.json`)))
  } catch {
    // Fall through to entry-based lookup
  }
  try {
    let dir = path.dirname(fs.realpathSync(egakiRequire.resolve(pkg)))
    while (true) {
      const pkgJsonPath = path.join(dir, 'package.json')
      if (fs.existsSync(pkgJsonPath)) {
        const name = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8')).name
        if (name === pkg) return dir
      }
      const parent = path.dirname(dir)
      if (parent === dir) return undefined
      dir = parent
    }
  } catch {
    return undefined
  }
}

/** All packages the shim should link: egaki itself plus every dependency
 *  and (present) optional/peer dependency of the egaki package. */
function shimPackageDirs(): Map<string, string> {
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(__pkgRoot, 'package.json'), 'utf-8'),
  )
  const names = new Set<string>([
    ...Object.keys(pkgJson.dependencies ?? {}),
    ...Object.keys(pkgJson.optionalDependencies ?? {}),
    ...Object.keys(pkgJson.peerDependencies ?? {}),
  ])
  const dirs = new Map<string, string>()
  dirs.set('egaki', fs.realpathSync(__pkgRoot))
  for (const name of names) {
    const dir = packageDirFromEgaki(name)
    if (dir) dirs.set(name, dir)
  }
  return dirs
}

/** Ensure bare imports resolve from the project root.
 *
 *  - egaki already resolvable from root → real project, do nothing
 *  - no node_modules (or a CLI-owned shim) → (re)create the shim
 *  - foreign node_modules without egaki → error with guidance
 */
export function ensureDependencyShim(root: string): Error | 'normal' | 'shim' {
  const nodeModulesDir = path.join(root, 'node_modules')
  const isShim = fs.existsSync(path.join(nodeModulesDir, SHIM_MARKER))

  if (!isShim) {
    // Walk up from root looking for node_modules/egaki — a plain fs walk
    // instead of createRequire().resolve() because test runners (tsx,
    // vitest) patch Node's resolver and make it resolve 'egaki' from the
    // wrong context, silently skipping shim creation.
    let dir = root
    while (true) {
      if (fs.existsSync(path.join(dir, 'node_modules', 'egaki', 'package.json'))) {
        return 'normal'
      }
      const parent = path.dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    if (fs.existsSync(nodeModulesDir)) {
      return new Error(
        `${nodeModulesDir} exists but 'egaki' is not installed there.\n` +
          `Either run 'npm install egaki' in ${root}, or remove node_modules ` +
          `to let 'egaki dev' manage dependencies automatically.`,
      )
    }
  }

  fs.mkdirSync(nodeModulesDir, { recursive: true })
  fs.writeFileSync(
    path.join(nodeModulesDir, SHIM_MARKER),
    'This node_modules was generated by `egaki dev`. Safe to delete.\n',
  )
  for (const [name, targetDir] of shimPackageDirs()) {
    const linkPath = path.join(nodeModulesDir, name)
    fs.mkdirSync(path.dirname(linkPath), { recursive: true })
    const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false })
    if (existing) {
      if (!existing.isSymbolicLink()) continue
      if (fs.readlinkSync(linkPath) === targetDir) continue
      fs.unlinkSync(linkPath)
    }
    fs.symlinkSync(targetDir, linkPath, 'dir')
  }
  return 'shim'
}

/** Walk up from a real path and collect the parent of every ancestor
 *  directory named node_modules. These parents are safe fs.allow roots
 *  that cover hoisted/pnpm-store dependency locations. */
function nodeModulesAncestorRoots(realPath: string): string[] {
  const roots: string[] = []
  let dir = realPath
  while (true) {
    const parent = path.dirname(dir)
    if (parent === dir) break
    if (path.basename(dir) === 'node_modules') roots.push(parent)
    dir = parent
  }
  return roots
}

/** Compute fs.allow roots so Vite can serve framework + dependency files
 *  that live outside the user's project root (in the CLI's install tree). */
function computeFsAllow(root: string): string[] {
  const allow = new Set<string>([root])
  const probes = [path.join(__pkgRoot, 'package.json')]
  for (const id of ['react', 'react-dom', 'remotion', 'vite', 'spiceflow']) {
    try {
      probes.push(egakiRequire.resolve(id))
    } catch {
      // Probe missing: skip
    }
  }
  for (const probe of probes) {
    try {
      const real = fs.realpathSync(probe)
      allow.add(path.dirname(real))
      for (const ancestorRoot of nodeModulesAncestorRoots(real)) {
        allow.add(ancestorRoot)
      }
    } catch {
      // Probe missing: skip
    }
  }
  allow.add(fs.realpathSync(__pkgRoot))
  return [...allow]
}

/** Resolve the entry option to { root, entryFile }.
 *  Accepts a file path, a directory, or nothing (cwd). */
function resolveEntry(entry: string | undefined): Error | { root: string; entryFile?: string } {
  const target = path.resolve(process.cwd(), entry ?? '.')
  if (!fs.existsSync(target)) {
    return new Error(`entry not found: ${target}`)
  }
  const stat = fs.statSync(target)
  if (stat.isDirectory()) {
    const hasMdx = fs
      .readdirSync(target)
      .some((name) => name.endsWith('.mdx'))
    if (!hasMdx) {
      return new Error(
        `no .mdx files found in ${target}\nCreate a video.mdx file or pass one explicitly: egaki dev path/to/video.mdx`,
      )
    }
    return { root: target }
  }
  if (!/\.mdx$/.test(target)) {
    return new Error(`entry must be an .mdx file or a directory, got: ${target}`)
  }
  return { root: path.dirname(target), entryFile: target }
}

/** Warm up the server: the very first request can 500 transiently while
 *  the dep optimizer discovers new deps and reloads the ssr program (a
 *  browser recovers via auto-reload, but agents/tests hit the URL once).
 *  Retry until the page serves 200 so the returned URL is ready to use. */
async function warmUp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Server not accepting connections yet
    }
    await new Promise((resolve) => setTimeout(resolve, 300))
  }
  console.warn(`[egaki] dev server warmup did not reach 200 within ${timeoutMs}ms`)
}

/** Start the zero-config dev server. Returns Error | RunningDevServer. */
export async function startDevServer(
  options: StartDevServerOptions = {},
): Promise<Error | RunningDevServer> {
  const entryResult = resolveEntry(options.entry)
  if (entryResult instanceof Error) return entryResult
  const { root, entryFile } = entryResult

  const shimResult = ensureDependencyShim(root)
  if (shimResult instanceof Error) return shimResult

  const host = options.host ?? 'localhost'
  const port = options.port ?? (await findFreePort())

  const rootHash = crypto.createHash('sha256').update(root).digest('hex').slice(0, 12)
  const cacheDir = path.join(os.homedir(), '.cache', 'egaki', 'vite', rootHash)

  const { createServer } = await import('vite')

  const server = await createServer({
    configFile: false,
    root,
    cacheDir,
    plugins: [video(entryFile ? { entry: entryFile } : undefined)],
    resolve: {
      dedupe: ['react', 'react-dom', 'remotion', '@remotion/player', '@remotion/media'],
    },
    server: {
      port,
      strictPort: true,
      host,
      fs: {
        allow: computeFsAllow(root),
      },
    },
  })

  await server.listen()

  const url = `http://${host}:${port}/`
  await warmUp(url, 60_000)

  return {
    url,
    port,
    root,
    server,
    close: () => server.close(),
  }
}
