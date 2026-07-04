// LUFS (Loudness Units Full Scale) measurement for audio files.
// Ported from meltica. Uses node-web-audio-api (native NAPI Rust binding)
// as an optional dependency. If missing, returns an Error with install instructions.
//
// Implements a simplified LUFS measurement inspired by EBU R128 / ITU-R BS.1770:
// K-weighting via biquad filters (approximate, not exact BS.1770 coefficients),
// 400ms blocks with 100ms hop, two-pass gating (absolute -70 LUFS gate, then
// relative -10 LU gate). Energy averaging is done in the linear domain (mean
// square) before converting to LUFS, which is the correct approach.
//
// The K-weighting filters are simplified (highpass 60Hz + highshelf 1500Hz)
// rather than the exact BS.1770 pre-filter + RLB coefficients, so results
// may differ slightly from reference implementations.

interface LoudnessResult {
  /** Integrated loudness in LUFS (two-pass gated average). */
  integrated: number
  /** Maximum momentary loudness (single 400ms block). */
  max: number
  /** Minimum momentary loudness above the absolute gate. */
  min: number
  /** Loudness range (max - min) in LU. */
  range: number
}

function lufsFromMeanSquare(ms: number): number {
  return -0.691 + 10 * Math.log10(ms)
}

export async function detectLoudness(buffer: ArrayBuffer): Promise<Error | LoudnessResult> {
  let webAudioMod: any
  try {
    webAudioMod = await import('node-web-audio-api')
  } catch {
    return new Error(
      'node-web-audio-api is required for loudness measurement. Install it:\n\n' +
      '  pnpm add node-web-audio-api\n',
    )
  }

  const context = new webAudioMod.AudioContext()
  try {
    const audioBuffer: AudioBuffer = await context.decodeAudioData(buffer)

    const offlineContext = new webAudioMod.OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate,
    )

    const source = offlineContext.createBufferSource()
    source.buffer = audioBuffer

    // Simplified K-weighting: high-pass at 60Hz + high-shelf boost at 1500Hz
    const highPass = offlineContext.createBiquadFilter()
    highPass.type = 'highpass'
    highPass.frequency.value = 60
    highPass.Q.value = 0.7

    const highShelf = offlineContext.createBiquadFilter()
    highShelf.type = 'highshelf'
    highShelf.frequency.value = 1500
    highShelf.gain.value = 4

    source.connect(highPass)
    highPass.connect(highShelf)
    highShelf.connect(offlineContext.destination)

    source.start(0)
    const rendered: AudioBuffer = await offlineContext.startRendering()

    // 400ms blocks, 100ms hop
    const blockSize = Math.floor(0.4 * rendered.sampleRate)
    const hopSize = Math.floor(0.1 * rendered.sampleRate)

    if (rendered.length < blockSize) {
      return new Error('Audio must be at least 400ms for loudness measurement.')
    }

    // Collect mean square energy per block
    const blocks: number[] = []

    for (let i = 0; i <= rendered.length - blockSize; i += hopSize) {
      let sumSquared = 0
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const data = rendered.getChannelData(ch)
        for (let j = 0; j < blockSize; j++) {
          sumSquared += data[i + j]! * data[i + j]!
        }
      }
      blocks.push(sumSquared / (blockSize * rendered.numberOfChannels))
    }

    // Two-pass gating per EBU R128:
    // Pass 1: absolute gate at -70 LUFS
    const absoluteGate = -70
    const absoluteGated = blocks.filter((ms) => lufsFromMeanSquare(ms) > absoluteGate)

    if (absoluteGated.length === 0) {
      return new Error('Audio is silent or below the -70 LUFS gate threshold.')
    }

    // Pass 2: relative gate at -10 LU below the absolute-gated integrated loudness
    const preliminaryMs = absoluteGated.reduce((s, v) => s + v, 0) / absoluteGated.length
    const relativeGate = lufsFromMeanSquare(preliminaryMs) - 10
    const relativeGated = absoluteGated.filter((ms) => lufsFromMeanSquare(ms) > relativeGate)

    if (relativeGated.length === 0) {
      return new Error('Audio is too quiet for reliable loudness measurement.')
    }

    // Integrated loudness: average energy in linear domain, then convert to LUFS
    const integratedMs = relativeGated.reduce((s, v) => s + v, 0) / relativeGated.length
    const integrated = lufsFromMeanSquare(integratedMs)

    // Momentary loudness values for range calculation (from absolute-gated blocks)
    const momentaryLufs = absoluteGated.map(lufsFromMeanSquare)
    const max = Math.max(...momentaryLufs)
    const min = Math.min(...momentaryLufs)
    const range = max - min

    return { integrated, max, min, range }
  } catch (err) {
    if (err instanceof Error) return err
    return new Error(String(err))
  } finally {
    await context.close().catch(() => {})
  }
}
