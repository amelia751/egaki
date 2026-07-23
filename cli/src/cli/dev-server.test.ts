// Tests for the zero-config dev server (egaki dev).
//
// Creates a temp directory containing ONLY a video.mdx file — no
// package.json, no vite.config.ts, no node_modules — and verifies the
// dev server boots, serves HTML at /, and resolves all framework deps
// from the CLI's own installation.

import { describe, test, expect, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import dedent from 'string-dedent'
import { startDevServer, findFreePort, type RunningDevServer } from './dev-server.ts'

const cleanups: Array<() => Promise<void>> = []

afterAll(async () => {
  for (const cleanup of cleanups) {
    await cleanup()
  }
})

function makeScratchProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egaki-dev-test-'))
  const MDX = dedent`
    ---
    width: 1920
    height: 1080
    fps: 30
    ---

    # Hello duration=2

    Zero-config dev server test.
  `
  fs.writeFileSync(path.join(dir, 'video.mdx'), MDX)
  cleanups.push(async () => {
    fs.rmSync(dir, { recursive: true, force: true })
  })
  return dir
}

describe('findFreePort', () => {
  test('returns a valid port number', async () => {
    const port = await findFreePort()
    expect(port).toBeGreaterThan(0)
    expect(port).toBeLessThan(65536)
  })
})

describe('startDevServer', () => {
  test('returns Error for missing entry', async () => {
    const result = await startDevServer({ entry: '/nonexistent/path/video.mdx' })
    expect(result).toBeInstanceOf(Error)
    if (result instanceof Error) {
      expect(result.message).toContain('entry not found')
    }
  })

  test('returns Error for directory without mdx files', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'egaki-dev-empty-'))
    cleanups.push(async () => {
      fs.rmSync(dir, { recursive: true, force: true })
    })
    const result = await startDevServer({ entry: dir })
    expect(result).toBeInstanceOf(Error)
    if (result instanceof Error) {
      expect(result.message).toContain('no .mdx files found')
    }
  })

  test('returns Error for non-mdx file entry', async () => {
    const dir = makeScratchProject()
    const txtPath = path.join(dir, 'notes.txt')
    fs.writeFileSync(txtPath, 'hi')
    const result = await startDevServer({ entry: txtPath })
    expect(result).toBeInstanceOf(Error)
    if (result instanceof Error) {
      expect(result.message).toContain('must be an .mdx file')
    }
  })

  test('serves a scratch mdx file with no package.json or node_modules', async () => {
    const dir = makeScratchProject()
    const result = await startDevServer({
      entry: path.join(dir, 'video.mdx'),
    })
    expect(result).not.toBeInstanceOf(Error)
    const running = result as RunningDevServer
    cleanups.push(() => running.close())

    expect(running.root).toBe(dir)
    expect(running.url).toMatch(/^http:\/\/localhost:\d+\/$/)

    const response = await fetch(running.url)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    const html = await response.text()
    // RSC streaming: the doctype shell arrives in a separate flush, so
    // assert on stable player UI markup instead of '<html'.
    expect(html).toContain('Export MP4')

    // The dependency shim was created and is CLI-owned
    expect(fs.existsSync(path.join(dir, 'node_modules', '.egaki-shim'))).toBe(true)
    expect(
      fs.lstatSync(path.join(dir, 'node_modules', 'egaki')).isSymbolicLink(),
    ).toBe(true)
  }, 120_000)
})
