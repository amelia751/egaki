// Tests for the speech provider timestamp parsing logic.
// Tests pure functions (no API calls): ElevenLabs character-to-word grouping,
// ElevenLabs NDJSON stream parsing, and Cartesia SSE stream parsing.

import { describe, it, expect } from 'vitest'
import { groupCharactersToWords, parseElevenLabsStream } from './elevenlabs-speech-provider.js'
import { parseCartesiaSseStream } from './cartesia-provider.js'

describe('ElevenLabs groupCharactersToWords', () => {
  it('groups simple words separated by spaces', () => {
    const result = groupCharactersToWords({
      characters: ['H', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd'],
      character_start_times_seconds: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
      character_end_times_seconds: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55],
    })
    expect(result).toMatchInlineSnapshot(`
      [
        {
          "endSecond": 0.25,
          "startSecond": 0,
          "word": "Hello",
        },
        {
          "endSecond": 0.55,
          "startSecond": 0.3,
          "word": "world",
        },
      ]
    `)
  })

  it('handles multiple spaces between words', () => {
    const result = groupCharactersToWords({
      characters: ['a', ' ', ' ', 'b'],
      character_start_times_seconds: [0, 0.1, 0.2, 0.3],
      character_end_times_seconds: [0.1, 0.2, 0.3, 0.4],
    })
    expect(result).toEqual([
      { word: 'a', startSecond: 0, endSecond: 0.1 },
      { word: 'b', startSecond: 0.3, endSecond: 0.4 },
    ])
  })

  it('handles punctuation attached to words', () => {
    const result = groupCharactersToWords({
      characters: ['H', 'i', '!', ' ', 'O', 'k', '.'],
      character_start_times_seconds: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3],
      character_end_times_seconds: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35],
    })
    expect(result).toEqual([
      { word: 'Hi!', startSecond: 0, endSecond: 0.15 },
      { word: 'Ok.', startSecond: 0.2, endSecond: 0.35 },
    ])
  })

  it('handles single character input', () => {
    const result = groupCharactersToWords({
      characters: ['a'],
      character_start_times_seconds: [0],
      character_end_times_seconds: [0.1],
    })
    expect(result).toEqual([{ word: 'a', startSecond: 0, endSecond: 0.1 }])
  })

  it('returns empty array for empty input', () => {
    const result = groupCharactersToWords({
      characters: [],
      character_start_times_seconds: [],
      character_end_times_seconds: [],
    })
    expect(result).toEqual([])
  })

  it('handles leading/trailing whitespace', () => {
    const result = groupCharactersToWords({
      characters: [' ', 'a', ' '],
      character_start_times_seconds: [0, 0.1, 0.2],
      character_end_times_seconds: [0.1, 0.2, 0.3],
    })
    expect(result).toEqual([{ word: 'a', startSecond: 0.1, endSecond: 0.2 }])
  })
})

describe('ElevenLabs parseElevenLabsStream', () => {
  function createNdjsonStream(lines: object[]): ReadableStream<Uint8Array> {
    const text = lines.map((l) => JSON.stringify(l)).join('\n')
    const encoder = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text))
        controller.close()
      },
    })
  }

  it('parses audio chunks and alignment', async () => {
    const lines = [
      {
        audio_base64: Buffer.from([1, 2, 3]).toString('base64'),
        normalized_alignment: {
          characters: ['H', 'i'],
          character_start_times_seconds: [0, 0.1],
          character_end_times_seconds: [0.1, 0.2],
        },
      },
      { audio_base64: Buffer.from([4, 5, 6]).toString('base64') },
    ]

    const result = await parseElevenLabsStream(createNdjsonStream(lines))

    expect(result.audioChunks.length).toBe(2)
    expect(result.alignment).toEqual({
      characters: ['H', 'i'],
      character_start_times_seconds: [0, 0.1],
      character_end_times_seconds: [0.1, 0.2],
    })
  })

  it('handles stream with no alignment', async () => {
    const lines = [
      { audio_base64: Buffer.from([1, 2, 3]).toString('base64') },
    ]

    const result = await parseElevenLabsStream(createNdjsonStream(lines))

    expect(result.audioChunks.length).toBe(1)
    expect(result.alignment).toBeUndefined()
  })

  it('prefers normalized_alignment over alignment', async () => {
    const lines = [
      {
        audio_base64: Buffer.from([1]).toString('base64'),
        alignment: {
          characters: ['4', '2'],
          character_start_times_seconds: [0, 0.1],
          character_end_times_seconds: [0.1, 0.2],
        },
        normalized_alignment: {
          characters: ['f', 'o', 'r', 't', 'y', ' ', 't', 'w', 'o'],
          character_start_times_seconds: [0, 0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16],
          character_end_times_seconds: [0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.18],
        },
      },
    ]

    const result = await parseElevenLabsStream(createNdjsonStream(lines))

    expect(result.alignment!.characters[0]).toBe('f') // normalized, not '4'
  })
})

describe('Cartesia parseCartesiaSseStream', () => {
  function createSseStream(events: string[]): ReadableStream<Uint8Array> {
    const text = events.map((e) => `data: ${e}\n\n`).join('')
    const encoder = new TextEncoder()
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(text))
        controller.close()
      },
    })
  }

  it('parses audio chunks and timestamps', async () => {
    const events = [
      JSON.stringify({ type: 'chunk', done: false, status_code: 206, data: 'AAAA', step_time: 10 }),
      JSON.stringify({
        type: 'timestamps', done: false, status_code: 206,
        word_timestamps: { words: ['Hello', 'world'], start: [0, 0.5], end: [0.4, 0.9] },
      }),
      JSON.stringify({ type: 'chunk', done: false, status_code: 206, data: 'BBBB', step_time: 10 }),
      JSON.stringify({ type: 'done', done: true, status_code: 206 }),
    ]

    const result = await parseCartesiaSseStream(createSseStream(events))

    expect(result.audioChunks.length).toBe(2)
    expect(result.timestamps).toEqual([
      { word: 'Hello', startSecond: 0, endSecond: 0.4 },
      { word: 'world', startSecond: 0.5, endSecond: 0.9 },
    ])
  })

  it('handles stream with no timestamps', async () => {
    const events = [
      JSON.stringify({ type: 'chunk', done: false, status_code: 206, data: 'AAAA', step_time: 10 }),
      JSON.stringify({ type: 'done', done: true, status_code: 206 }),
    ]

    const result = await parseCartesiaSseStream(createSseStream(events))

    expect(result.audioChunks.length).toBe(1)
    expect(result.timestamps).toEqual([])
  })

  it('throws on error events', async () => {
    const events = [
      JSON.stringify({ type: 'error', done: true, status_code: 400, message: 'Invalid model', title: 'Bad Request' }),
    ]

    await expect(parseCartesiaSseStream(createSseStream(events)))
      .rejects.toThrow('Cartesia TTS SSE error 400: Invalid model')
  })

  it('handles multiple timestamp events', async () => {
    const events = [
      JSON.stringify({
        type: 'timestamps', done: false, status_code: 206,
        word_timestamps: { words: ['Hello'], start: [0], end: [0.4] },
      }),
      JSON.stringify({
        type: 'timestamps', done: false, status_code: 206,
        word_timestamps: { words: ['world'], start: [0.5], end: [0.9] },
      }),
      JSON.stringify({ type: 'done', done: true, status_code: 206 }),
    ]

    const result = await parseCartesiaSseStream(createSseStream(events))

    expect(result.timestamps).toEqual([
      { word: 'Hello', startSecond: 0, endSecond: 0.4 },
      { word: 'world', startSecond: 0.5, endSecond: 0.9 },
    ])
  })
})
