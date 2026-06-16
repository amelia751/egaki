/**
 * Tests for the centralized egaki client store.
 * Pure state transitions — no React, no mocks, just data in and data out.
 */

import { describe, test, expect, beforeEach } from 'vitest'
import {
  egakiStore,
  selectMediaDurations,
  selectGenerationStatus,
} from './store.ts'
import {
  reportSectionDuration,
  clearSectionDuration,
  resetSectionDurations,
} from './media-duration-store.ts'

beforeEach(() => {
  egakiStore.setState({
    modules: {},
    sectionReports: new Map(),
    activeGenerations: new Map(),
  })
})

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

describe('modules', () => {
  test('setState updates modules', () => {
    const mods = { './foo.tsx': { default: () => null } }
    egakiStore.setState({ modules: mods })
    expect(egakiStore.getState().modules).toBe(mods)
  })

  test('setState replaces previous modules', () => {
    egakiStore.setState({ modules: { './a.tsx': { default: 1 } } })
    const next = { './b.tsx': { default: 2 } }
    egakiStore.setState({ modules: next })
    expect(egakiStore.getState().modules).toBe(next)
    expect(egakiStore.getState().modules['./a.tsx']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Section duration reports
// ---------------------------------------------------------------------------

describe('sectionReports', () => {
  test('reportSectionDuration adds a report', () => {
    reportSectionDuration(0, 'inst-1', 5.5)
    const durations = selectMediaDurations(egakiStore.getState())
    expect(durations).toMatchInlineSnapshot(`
      {
        "0": 5.5,
      }
    `)
  })

  test('per-section max is derived from multiple instances', () => {
    reportSectionDuration(0, 'inst-1', 3)
    reportSectionDuration(0, 'inst-2', 7)
    reportSectionDuration(0, 'inst-3', 5)
    const durations = selectMediaDurations(egakiStore.getState())
    expect(durations['0']).toBe(7)
  })

  test('multiple sections tracked independently', () => {
    reportSectionDuration(0, 'a', 2)
    reportSectionDuration(1, 'b', 4)
    reportSectionDuration(2, 'c', 6)
    const durations = selectMediaDurations(egakiStore.getState())
    expect(durations).toMatchInlineSnapshot(`
      {
        "0": 2,
        "1": 4,
        "2": 6,
      }
    `)
  })

  test('duplicate report with same value is a no-op', () => {
    reportSectionDuration(0, 'inst-1', 5)
    const before = egakiStore.getState().sectionReports
    reportSectionDuration(0, 'inst-1', 5)
    expect(egakiStore.getState().sectionReports).toBe(before)
  })

  test('clearSectionDuration removes an instance report', () => {
    reportSectionDuration(0, 'a', 3)
    reportSectionDuration(0, 'b', 7)
    clearSectionDuration(0, 'b')
    const durations = selectMediaDurations(egakiStore.getState())
    expect(durations['0']).toBe(3)
  })

  test('clearSectionDuration removes section entry when last instance clears', () => {
    reportSectionDuration(0, 'a', 3)
    clearSectionDuration(0, 'a')
    const durations = selectMediaDurations(egakiStore.getState())
    expect(durations).toMatchInlineSnapshot(`{}`)
  })

  test('clearSectionDuration is a no-op for missing instance', () => {
    reportSectionDuration(0, 'a', 3)
    const before = egakiStore.getState().sectionReports
    clearSectionDuration(0, 'nonexistent')
    expect(egakiStore.getState().sectionReports).toBe(before)
  })

  test('resetSectionDurations clears all reports', () => {
    reportSectionDuration(0, 'a', 3)
    reportSectionDuration(1, 'b', 5)
    resetSectionDurations()
    expect(egakiStore.getState().sectionReports.size).toBe(0)
    expect(selectMediaDurations(egakiStore.getState())).toMatchInlineSnapshot(`{}`)
  })

  test('resetSectionDurations is a no-op when already empty', () => {
    const before = egakiStore.getState().sectionReports
    resetSectionDurations()
    expect(egakiStore.getState().sectionReports).toBe(before)
  })

  test('ignores invalid inputs', () => {
    reportSectionDuration(-1, 'a', 5)
    reportSectionDuration(0, 'a', NaN)
    reportSectionDuration(0, 'a', 0)
    reportSectionDuration(0, 'a', -1)
    expect(egakiStore.getState().sectionReports.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Generation tracker
// ---------------------------------------------------------------------------

describe('activeGenerations', () => {
  test('setState tracks a generation', () => {
    egakiStore.setState((s) => {
      const next = new Map(s.activeGenerations)
      next.set('id-1', 'image')
      return { activeGenerations: next }
    })
    const status = selectGenerationStatus(egakiStore.getState())
    expect(status).toMatchInlineSnapshot(`
      {
        "images": 1,
        "speeches": 0,
        "total": 1,
        "videos": 0,
      }
    `)
  })

  test('multiple generation types counted separately', () => {
    egakiStore.setState({
      activeGenerations: new Map([
        ['a', 'image'],
        ['b', 'image'],
        ['c', 'video'],
        ['d', 'speech'],
      ]),
    })
    const status = selectGenerationStatus(egakiStore.getState())
    expect(status).toMatchInlineSnapshot(`
      {
        "images": 2,
        "speeches": 1,
        "total": 4,
        "videos": 1,
      }
    `)
  })

  test('removing a generation updates counts', () => {
    egakiStore.setState({
      activeGenerations: new Map([
        ['a', 'image'],
        ['b', 'video'],
      ]),
    })
    egakiStore.setState((s) => {
      const next = new Map(s.activeGenerations)
      next.delete('a')
      return { activeGenerations: next }
    })
    const status = selectGenerationStatus(egakiStore.getState())
    expect(status).toMatchInlineSnapshot(`
      {
        "images": 0,
        "speeches": 0,
        "total": 1,
        "videos": 1,
      }
    `)
  })

  test('returns null when no generations active', () => {
    expect(selectGenerationStatus(egakiStore.getState())).toBeNull()
  })

  test('returns null after all generations removed', () => {
    egakiStore.setState({ activeGenerations: new Map([['a', 'image']]) })
    egakiStore.setState({ activeGenerations: new Map() })
    expect(selectGenerationStatus(egakiStore.getState())).toBeNull()
  })
})
