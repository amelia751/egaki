// BPM detection for audio files using Web Audio API.
// Ported from https://github.com/tornqvist/bpm-detective
// Uses node-web-audio-api (native NAPI Rust binding) as an optional dependency.
// If missing, returns an Error with install instructions.

interface BpmResult {
  bpm: number
  intervalInSeconds: number
}

// Cached module reference set by detectBpm() before calling detect().
// This avoids require() in ESM and avoids passing the module through every function.
let webAudioMod: any = null

export async function detectBpm(buffer: ArrayBuffer): Promise<Error | BpmResult> {
  try {
    webAudioMod = await import('node-web-audio-api')
  } catch {
    return new Error(
      'node-web-audio-api is required for BPM detection. Install it:\n\n' +
      '  pnpm add node-web-audio-api\n',
    )
  }

  const context = new webAudioMod.AudioContext()
  try {
    const data: AudioBuffer = await context.decodeAudioData(buffer)
    const bpm = detect(data)
    const intervalInSeconds = 60 / bpm
    return { bpm, intervalInSeconds }
  } catch (err) {
    if (err instanceof Error) return err
    return new Error(String(err))
  } finally {
    await context.close().catch(() => {})
  }
}

// ─── algorithm ──────────────────────────────────────────────────────────────

interface TempoCount {
  tempo: number
  count: number
}

interface IntervalCount {
  interval: number
  count: number
}

function detect(buffer: AudioBuffer): number {
  const source = getLowPassSource(buffer)
  source.start(0)

  const channelData = source.buffer!.getChannelData(0)
  const peaks = findPeaks(channelData)
  const intervals = identifyIntervals(peaks)
  const tempoCounts = groupByTempo(buffer.sampleRate, intervals)
  return getTopCandidate(tempoCounts)
}

function getTopCandidate(candidates: TempoCount[]): number {
  return candidates.sort((a, b) => b.count - a.count).splice(0, 5)[0]!.tempo
}

function getLowPassSource(buffer: AudioBuffer): AudioBufferSourceNode {
  const { length, numberOfChannels, sampleRate } = buffer
  const context = new webAudioMod.OfflineAudioContext(numberOfChannels, length, sampleRate)
  const source = context.createBufferSource()
  source.buffer = buffer

  const filter = context.createBiquadFilter()
  filter.type = 'lowpass'

  source.connect(filter)
  filter.connect(context.destination)

  return source
}

function findPeaks(data: Float32Array): number[] {
  let peaks: number[] = []
  let threshold = 0.9
  const minThreshold = 0.3
  const minPeaks = 15

  while (peaks.length < minPeaks && threshold >= minThreshold) {
    peaks = findPeaksAtThreshold(data, threshold)
    threshold -= 0.05
  }

  if (peaks.length < minPeaks) {
    throw new Error('Could not find enough samples for a reliable BPM detection.')
  }

  return peaks
}

function findPeaksAtThreshold(data: Float32Array, threshold: number): number[] {
  const peaks: number[] = []

  for (let i = 0, l = data.length; i < l; i += 1) {
    if (data[i]! > threshold) {
      peaks.push(i)
      // Skip forward ~1/4s to get past this peak
      i += 10000
    }
  }

  return peaks
}

function identifyIntervals(peaks: number[]): IntervalCount[] {
  const intervals: IntervalCount[] = []

  peaks.forEach((peak, index) => {
    for (let i = 0; i < 10; i += 1) {
      const interval = peaks[index + i]! - peak

      const foundInterval = intervals.some((ic) => {
        if (ic.interval === interval) {
          ic.count += 1
          return true
        }
        return false
      })

      if (!foundInterval) {
        intervals.push({ interval, count: 1 })
      }
    }
  })

  return intervals
}

function groupByTempo(sampleRate: number, intervalCounts: IntervalCount[]): TempoCount[] {
  const tempoCounts: TempoCount[] = []

  intervalCounts.forEach((intervalCount) => {
    if (intervalCount.interval !== 0) {
      let theoreticalTempo = 60 / (intervalCount.interval / sampleRate)

      // Adjust to fit within the 90-180 BPM range
      while (theoreticalTempo < 90) theoreticalTempo *= 2
      while (theoreticalTempo > 180) theoreticalTempo /= 2

      theoreticalTempo = Math.round(theoreticalTempo)

      const foundTempo = tempoCounts.some((tc) => {
        if (tc.tempo === theoreticalTempo) {
          tc.count += intervalCount.count
          return true
        }
        return false
      })

      if (!foundTempo) {
        tempoCounts.push({ tempo: theoreticalTempo, count: intervalCount.count })
      }
    }
  })

  return tempoCounts
}
