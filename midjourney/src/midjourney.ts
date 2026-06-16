/**
 * Midjourney SDK — controls midjourney.com through the user's browser via Playwriter.
 *
 * Requires:
 * 1. Chrome with the Playwriter extension installed and enabled
 * 2. The Playwriter relay server running (starts automatically or via `playwriter serve`)
 * 3. The user logged into midjourney.com in Chrome
 *
 * All API calls happen inside page.evaluate() so the browser's session cookies
 * are used automatically. No tokens or API keys needed.
 */

import { chromium, type Browser, type Page } from '@xmorse/playwright-core'
import type { MidjourneyJob, MidjourneySearchOptions } from './types.ts'
import { filterByAspectRatio } from './types.ts'

export class MidjourneyNotLoggedInError extends Error {
  constructor() {
    super(
      'Not logged in to Midjourney. Open https://www.midjourney.com in Chrome and log in, then enable the Playwriter extension on that tab.',
    )
    this.name = 'MidjourneyNotLoggedInError'
  }
}

export class MidjourneyConnectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MidjourneyConnectionError'
  }
}

const MIDJOURNEY_ORIGIN = 'https://www.midjourney.com'

type SearchResult =
  | { ok: false; error: 'not_logged_in'; status: number }
  | { ok: false; error: 'request_failed'; status: number; statusText: string }
  | { ok: true; data: unknown }

export interface MidjourneyOptions {
  /**
   * Playwriter relay server port. Default: 19988
   */
  port?: number
  /**
   * Playwriter relay server host. Default: '127.0.0.1'
   */
  host?: string
}

export class Midjourney {
  private browser: Browser | null = null
  private page: Page | null = null
  private port: number
  private host: string

  constructor(options: MidjourneyOptions = {}) {
    this.port = options.port ?? 19988
    this.host = options.host ?? '127.0.0.1'
  }

  /**
   * Connects to Chrome via Playwriter's CDP relay, finds or creates a
   * midjourney.com tab, and returns the Page handle.
   *
   * Idempotent: subsequent calls reuse the existing connection if still alive.
   */
  private async ensurePage(): Promise<Page> {
    if (this.page && !this.page.isClosed()) {
      return this.page
    }

    // Connect to the Playwriter relay. If not running, this will throw with a
    // clear connection-refused error. The user should start it with `playwriter serve`
    // or the CLI will auto-start it.
    try {
      const id = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}`
      const cdpUrl = `ws://${this.host}:${this.port}/cdp/${id}`
      this.browser = await chromium.connectOverCDP(cdpUrl)
    } catch (err) {
      throw new MidjourneyConnectionError(
        `Could not connect to Playwriter relay at ${this.host}:${this.port}. ` +
          'Make sure Chrome is open with the Playwriter extension enabled. ' +
          'Run `playwriter serve` or `playwriter session new` to start the relay.',
        { cause: err },
      )
    }

    const context = this.browser.contexts()[0]
    if (!context) {
      throw new MidjourneyConnectionError(
        'No browser context found. Make sure the Playwriter extension is enabled on at least one tab.',
      )
    }

    // Look for an existing midjourney.com tab
    const pages = context.pages()
    let mjPage = pages.find((p) => p.url().startsWith(MIDJOURNEY_ORIGIN))

    if (!mjPage) {
      // Create a new tab and navigate to Midjourney
      mjPage = await context.newPage()
      await mjPage.goto(MIDJOURNEY_ORIGIN, { waitUntil: 'domcontentloaded' })
    }

    this.page = mjPage
    return mjPage
  }

  /**
   * Search the Midjourney explore feed with a text prompt.
   * Uses the same vector search endpoint as the website's explore page.
   *
   * Returns an array of jobs (typically 49 per page).
   */
  async search(prompt: string, options: MidjourneySearchOptions = {}): Promise<MidjourneyJob[]> {
    const page = await this.ensurePage()
    const pageNum = options.page ?? 1

    const result: SearchResult = await page.evaluate(
      async ({ prompt, pageNum }) => {
        const url = `/api/explore-vector-search?prompt=${encodeURIComponent(prompt)}&page=${pageNum}&_ql=explore`
        const res = await fetch(url, {
          credentials: 'include',
          headers: { 'x-csrf-protection': '1' },
        })

        if (res.status === 401 || res.status === 403) {
          return { ok: false as const, error: 'not_logged_in' as const, status: res.status }
        }

        if (!res.ok) {
          return { ok: false as const, error: 'request_failed' as const, status: res.status, statusText: res.statusText }
        }

        const data = await res.json()
        return { ok: true as const, data }
      },
      { prompt, pageNum },
    )

    if (!result.ok) {
      if (result.error === 'not_logged_in') {
        throw new MidjourneyNotLoggedInError()
      }
      throw new Error(`Midjourney API error: ${result.status} ${result.statusText}`)
    }

    let jobs = result.data as MidjourneyJob[]

    if (options.aspectRatio) {
      jobs = filterByAspectRatio({ jobs, aspectRatio: options.aspectRatio, tolerance: options.aspectRatioTolerance })
    }

    return jobs
  }

  /**
   * Disconnect from Chrome. Does NOT close the browser or any tabs,
   * only drops the CDP connection.
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close()
      this.browser = null
      this.page = null
    }
  }
}
