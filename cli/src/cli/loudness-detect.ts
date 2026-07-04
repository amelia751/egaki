// LUFS (Loudness Units Full Scale) measurement for audio files.
// Ported from meltica. Uses node-web-audio-api (native NAPI Rust binding)
// as an optional dependency. If missing, returns an Error with install instructions.
//
// LUFS is the broadcast standard for perceived loudness (EBU R128 / ITU-R BS.1770).
// The algorithm applies K-weighting (high-pass + high-shelf filters), then measures
// mean square loudness in 400ms blocks with 100ms hop. Integrated loudness is the
// average of all blocks above a -70 LUFS gate threshold.

interface LoudnessResult {
  /** Integrated loudness in LUFS (gated average across the entire file). */
  integrated: number
  /** Maximum momentary loudness (single 400ms block). */
  max: number
  /** Minimum momentary loudness above the gate threshold. */
  min: number
  /** Loudness range (max - min). */
  range: number
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

    // K-weighting: high-pass at 60Hz + high-shelf boost at 1500Hz
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
    const momentary: number[] = []

    for (let i = 0; i < rendered.length - blockSize; i += hopSize) {
      let sumSquared = 0
      for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const data = rendered.getChannelData(ch)
        for (let j = 0; j < blockSize; j++) {
          sumSquared += data[i + j]! * data[i + j]!
        }
      }
      const meanSquare = sumSquared / (blockSize * rendered.numberOfChannels)
      momentary.push(-0.691 + 10 * Math.log10(meanSquare))
    }

    const gate = -70
    const valid = momentary.filter((v) => v > gate)
    const integrated = valid.length > 0
      ? valid.reduce((sum, v) => sum + v, 0) / valid.length
      : -Infinity

    const max = Math.max(...momentary)
    const min = valid.length > 0 ? Math.min(...valid) : -Infinity
    const range = max - min

    return { integrated, max, min, range }
  } catch (err) {
    if (err instanceof Error) return err
    return new Error(String(err))
  } finally {
    await context.close().catch(() => {})
  }
}
