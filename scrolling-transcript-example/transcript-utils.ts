// Shared utilities for scrolling transcript: types, text extraction, word
// alignment. These run in both server (narration.server.tsx) and client
// (scrolling-transcript.tsx) environments. No 'use client' directive, no
// remotion imports; only pure functions and safe-mdx/parse (isomorphic).

import { mdxParse } from 'safe-mdx/parse'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrollSection {
  /** Markdown string for this section */
  markdown: string
  /** Reading speed in words per minute; controls how long this section stays centered */
  speed: number
}

/** Per-word timing from transcription, aligned to a section's text. */
export interface WordTiming {
  word: string
  startSecond: number
  endSecond: number
}

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

export function countWords(text: string): number {
  return text.replace(/[*_`#\[\]()]/g, '').split(/\s+/).filter(Boolean).length
}

/** Extract plain text from markdown using AST walk.
 *  Collects all text and inlineCode node values, skipping formatting syntax. */
export function extractPlainText(markdown: string): string {
  const ast = mdxParse(markdown)
  const texts: string[] = []
  function walk(node: any) {
    if (node.type === 'text' || node.type === 'inlineCode') {
      texts.push(node.value)
    }
    if (node.children) node.children.forEach(walk)
  }
  walk(ast)
  return texts.join(' ').replace(/\s+/g, ' ').trim()
}

/** Compute total duration in seconds for a set of sections (including padding). */
export function computeTotalSeconds(sections: ScrollSection[], paddingSeconds = 2): number {
  let total = paddingSeconds
  for (const s of sections) {
    total += (countWords(s.markdown) / s.speed) * 60
  }
  total += paddingSeconds
  return Math.ceil(total)
}

// ---------------------------------------------------------------------------
// Word alignment: fuzzy-match transcription words to markdown section text
// ---------------------------------------------------------------------------

/** Normalize a word for comparison: lowercase, strip punctuation. */
function normalizeWord(w: string): string {
  return w.toLowerCase().replace(/[^a-z0-9']/g, '')
}

/**
 * Greedy forward alignment of transcription word timestamps to markdown sections.
 *
 * For each section, strips markdown formatting, tokenizes into words, then
 * walks both the section words and transcription words with two pointers.
 * Handles filler words in speech ("um", "uh"), minor mismatches ("that's"
 * vs "that is"), and missing words in either side.
 *
 * Unmatched words get linearly interpolated timing from nearest neighbors.
 */
export function alignWordsToSections(
  sections: ScrollSection[],
  transcriptionWords: { word: string; startSecond: number; endSecond: number }[],
): WordTiming[][] {
  // Build flat list of all section words with their section index
  const allSectionWords: { word: string; sectionIdx: number; wordIdx: number }[] = []
  const sectionWordCounts: number[] = []
  for (let si = 0; si < sections.length; si++) {
    const words = extractPlainText(sections[si].markdown).split(/\s+/).filter(Boolean)
    sectionWordCounts.push(words.length)
    for (let wi = 0; wi < words.length; wi++) {
      allSectionWords.push({ word: words[wi], sectionIdx: si, wordIdx: wi })
    }
  }

  // Align with two pointers
  const timingMap = new Map<number, { startSecond: number; endSecond: number }>()
  let txPtr = 0
  for (let mdPtr = 0; mdPtr < allSectionWords.length; mdPtr++) {
    if (txPtr >= transcriptionWords.length) break
    const mdNorm = normalizeWord(allSectionWords[mdPtr].word)
    if (!mdNorm) continue

    // Try exact match at current position
    if (normalizeWord(transcriptionWords[txPtr].word) === mdNorm) {
      timingMap.set(mdPtr, transcriptionWords[txPtr])
      txPtr++
      continue
    }

    // Look ahead up to 3 transcription words for a match (handles filler words)
    let found = false
    for (let lookahead = 1; lookahead <= 3 && txPtr + lookahead < transcriptionWords.length; lookahead++) {
      if (normalizeWord(transcriptionWords[txPtr + lookahead].word) === mdNorm) {
        txPtr += lookahead
        timingMap.set(mdPtr, transcriptionWords[txPtr])
        txPtr++
        found = true
        break
      }
    }
    if (found) continue

    // Look ahead in markdown words to see if transcription word matches a future one
    // (handles words in markdown that transcription skipped)
    let mdFound = false
    for (let lookahead = 1; lookahead <= 2 && mdPtr + lookahead < allSectionWords.length; lookahead++) {
      if (normalizeWord(allSectionWords[mdPtr + lookahead].word) === normalizeWord(transcriptionWords[txPtr].word)) {
        // Skip this markdown word, it has no match
        mdFound = true
        break
      }
    }
    if (!mdFound) {
      // Neither side matched; advance transcription pointer
      txPtr++
      mdPtr-- // retry this markdown word with next transcription word
    }
  }

  // Interpolate gaps: words without a direct match get timing from nearest neighbors
  const sortedMatched = [...timingMap.entries()].sort((a, b) => a[0] - b[0])
  for (let mdPtr = 0; mdPtr < allSectionWords.length; mdPtr++) {
    if (timingMap.has(mdPtr)) continue

    // Find nearest previous and next matched words
    let prevIdx = -1, nextIdx = -1
    let prevTiming: { startSecond: number; endSecond: number } | undefined
    let nextTiming: { startSecond: number; endSecond: number } | undefined
    for (const [idx, timing] of sortedMatched) {
      if (idx < mdPtr) { prevIdx = idx; prevTiming = timing }
      if (idx > mdPtr && nextIdx === -1) { nextIdx = idx; nextTiming = timing }
    }

    if (prevTiming && nextTiming) {
      const range = nextIdx - prevIdx
      const progress = (mdPtr - prevIdx) / range
      const start = prevTiming.endSecond + progress * (nextTiming.startSecond - prevTiming.endSecond)
      const end = start + (nextTiming.endSecond - nextTiming.startSecond) / range
      timingMap.set(mdPtr, { startSecond: start, endSecond: end })
    } else if (prevTiming) {
      const gap = 0.1
      timingMap.set(mdPtr, { startSecond: prevTiming.endSecond, endSecond: prevTiming.endSecond + gap })
    } else if (nextTiming) {
      const gap = 0.1
      timingMap.set(mdPtr, { startSecond: Math.max(0, nextTiming.startSecond - gap), endSecond: nextTiming.startSecond })
    }
  }

  // Split back into per-section arrays
  const result: WordTiming[][] = sections.map(() => [])
  let flatIdx = 0
  for (let si = 0; si < sections.length; si++) {
    const words = extractPlainText(sections[si].markdown).split(/\s+/).filter(Boolean)
    for (let wi = 0; wi < words.length; wi++) {
      const timing = timingMap.get(flatIdx)
      result[si].push({
        word: words[wi],
        startSecond: timing?.startSecond ?? 0,
        endSecond: timing?.endSecond ?? 0,
      })
      flatIdx++
    }
  }
  return result
}
