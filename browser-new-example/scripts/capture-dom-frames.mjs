// Capture artboard region from Remotion player for RMSE compare vs Jitter refs.
// Run: cd browser-new-example && playwriter -s N -f scripts/capture-dom-frames.mjs --timeout 120000
const SCALE = 0.9
const OFFSET_X = (1920 - 1920 * SCALE) / 2
const OFFSET_Y = (1080 - 1200 * SCALE) / 2
const AW = 1920
const AH = 1200
const times = [0, 400, 900, 1250, 1750, 2200, 3000]
const fps = 30

const page =
  context.pages().find((p) => p.url().includes('5202')) ?? (await context.newPage())
if (!page.url().includes('5202')) {
  await page.goto('http://localhost:5202/', { waitUntil: 'domcontentloaded' })
  await waitForPageLoad({ page, timeout: 20000 })
}
await page.waitForFunction(() => window.egakiSDK?.getInfo, { timeout: 30000 })

const fs = require('node:fs')
const path = require('node:path')
const scriptDir = path.dirname(process.argv[1] || '.')
const dir = path.join(scriptDir, '..', 'reference-frames')
// cwd should be browser-new-example when invoked via: cd browser-new-example && playwriter -f scripts/...
fs.mkdirSync(dir, { recursive: true })

const player = page.locator('[class*="remotion"]').first()
const box = await player.boundingBox()
if (!box) throw new Error('no player bbox')

for (const ms of times) {
  const frame = Math.round((ms / 1000) * fps)
  await page.evaluate((f) => window.egakiSDK.seekTo(f), frame)
  await page.waitForTimeout(400)
  const sx = box.width / 1920
  const sy = box.height / 1080
  const clip = {
    x: box.x + OFFSET_X * sx,
    y: box.y + OFFSET_Y * sy,
    width: AW * SCALE * sx,
    height: AH * SCALE * sy,
  }
  const out = path.join(dir, `dom-${ms}.png`)
  await page.screenshot({ path: out, scale: 'css', clip })
  console.log('wrote', out, clip)
}