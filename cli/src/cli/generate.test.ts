// Tests for the programmatic generation API (generate.ts).
// Tests the error-as-value pattern and validation logic without
// making actual API calls (no credentials needed).
import { describe, it, expect } from 'vitest'
import {
  generateImage,
  generateVideo,
  calculateCost,
  buildImageProviderOptions,
  buildVideoProviderOptions,
  ValidationError,
} from './generate.js'

describe('generateImage', () => {
  it('returns ValidationError for unknown model', async () => {
    const result = await generateImage({
      prompt: 'test',
      model: 'nonexistent-model-xyz',
    })
    expect(result).toBeInstanceOf(ValidationError)
    expect((result as Error).message).toMatch(/Unknown model/)
  })
})

describe('generateVideo', () => {
  it('returns Error for unknown model', async () => {
    const result = await generateVideo({
      prompt: 'test',
      model: 'nonexistent-model-xyz',
    })
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(/Unknown model/)
  })

  it('returns Error when using image model as video model', async () => {
    const result = await generateVideo({
      prompt: 'test',
      model: 'imagen-4.0-generate-001',
    })
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toMatch(/not a video model/)
  })

  it('returns Error when reference-to-video mode has no reference images', async () => {
    const result = await generateVideo({
      prompt: 'test',
      model: 'veo-3.1-fast-generate-001',
      mode: 'reference-to-video',
    })
    expect(result).toBeInstanceOf(ValidationError)
    expect((result as Error).message).toMatch(/referenceImages is required/)
  })

  it('returns Error when edit-video mode has no videoUrl', async () => {
    const result = await generateVideo({
      prompt: 'test',
      model: 'grok-imagine-video',
      mode: 'edit-video',
      inputImage: new Uint8Array([1, 2, 3]),
    })
    expect(result).toBeInstanceOf(ValidationError)
    expect((result as Error).message).toMatch(/videoUrl is required/)
  })
})

describe('calculateCost', () => {
  it('calculates per-image cost', () => {
    const cost = calculateCost(
      { type: 'per-image', perImage: 0.04 },
      {},
      3,
    )
    expect(cost).toBeCloseTo(0.12)
  })

  it('calculates per-token cost', () => {
    const cost = calculateCost(
      { type: 'per-token', inputPerM: 1.25, outputPerM: 5.0 },
      { inputTokens: 1000, outputTokens: 500 },
    )
    // (1000 * 1.25 + 500 * 5.0) / 1_000_000 = 0.00375
    expect(cost).toBeCloseTo(0.00375)
  })

  it('calculates per-video-second cost', () => {
    const cost = calculateCost(
      {
        type: 'per-video-second',
        defaultDurationSec: 5,
        tiers: [{ costPerSecond: 0.05 }],
      },
      { durationSeconds: 10 },
    )
    expect(cost).toBeCloseTo(0.5)
  })

  it('uses default duration when none specified', () => {
    const cost = calculateCost(
      {
        type: 'per-video-second',
        defaultDurationSec: 5,
        tiers: [{ costPerSecond: 0.05 }],
      },
      {},
    )
    expect(cost).toBeCloseTo(0.25)
  })

  it('returns null for unknown cost type', () => {
    const cost = calculateCost({ type: 'unknown' }, {})
    expect(cost).toBeNull()
  })
})

describe('buildImageProviderOptions', () => {
  it('builds google options with person generation', () => {
    const opts = buildImageProviderOptions('google', {
      allowPeople: true,
      aspectRatio: '16:9',
    })
    expect(opts.google).toEqual({
      personGeneration: 'allow_all',
      aspectRatio: '16:9',
    })
  })

  it('builds xai options with quality', () => {
    const opts = buildImageProviderOptions('xai', {
      allowPeople: false,
      quality: 'high',
      resolution: '4k',
    })
    expect(opts.xai).toEqual({
      quality: 'high',
      resolution: '4k',
    })
  })

  it('returns empty for unknown provider', () => {
    const opts = buildImageProviderOptions('unknown-provider', {
      allowPeople: false,
    })
    expect(opts).toEqual({})
  })
})

describe('buildVideoProviderOptions', () => {
  it('builds xai edit-video options', () => {
    const opts = buildVideoProviderOptions('xai', {
      mode: 'edit-video',
      videoUrl: 'https://example.com/video.mp4',
      model: 'grok-imagine-video',
    })
    expect(opts?.xai).toEqual({
      mode: 'edit-video',
      videoUrl: 'https://example.com/video.mp4',
    })
  })

  it('returns undefined for provider with no options', () => {
    const opts = buildVideoProviderOptions('google', {
      model: 'veo-3.1-fast-generate-001',
    })
    expect(opts).toBeUndefined()
  })
})
