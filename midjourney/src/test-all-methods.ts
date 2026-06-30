/**
 * Integration test script for all Midjourney SDK methods.
 *
 * Requires:
 * - Chrome open with Playwriter extension enabled on a midjourney.com tab
 * - User logged into midjourney.com
 *
 * Run: npx tsx midjourney/src/test-all-methods.ts
 */

import { Midjourney, getImageUrl, getVideoUrl, getVideoThumbnailUrl } from './index.ts'

async function main() {
  const mj = new Midjourney()

  try {
    // -----------------------------------------------------------------------
    // 1. getUserId
    // -----------------------------------------------------------------------
    console.log('\n=== 1. getUserId ===')
    const userId = await mj.getUserId()
    console.log('User ID:', userId)
    if (!userId) throw new Error('getUserId returned empty')
    console.log('✓ getUserId works')

    // -----------------------------------------------------------------------
    // 2. getStorage
    // -----------------------------------------------------------------------
    console.log('\n=== 2. getStorage ===')
    const storage = await mj.getStorage()
    console.log('Storage files:', storage.length)
    if (storage.length > 0) {
      const first = storage[0]!
      console.log('First file:', first.bucketPathname, first.cleanedContentType, first.state)
    }
    console.log('✓ getStorage works')

    // -----------------------------------------------------------------------
    // 3. search (already existed, verify still works)
    // -----------------------------------------------------------------------
    console.log('\n=== 3. search ===')
    const searchResults = await mj.search('mountain landscape sunset', { page: 1 })
    console.log('Search results:', searchResults.length)
    if (searchResults.length > 0) {
      const first = searchResults[0]!
      console.log('First result:', first.id, first.job_type, first.width + 'x' + first.height)
      console.log('Image URL:', getImageUrl(first))
    }
    console.log('✓ search works')

    // -----------------------------------------------------------------------
    // 4. generate (image)
    // -----------------------------------------------------------------------
    console.log('\n=== 4. generate (image) ===')
    const genResult = await mj.generate('a tiny golden frog sitting on a leaf, macro photography', {
      aspectRatio: '16:9',
      version: '7',
    })
    console.log('Job ID:', genResult.job_id)
    console.log('Job type:', genResult.job_type)
    console.log('Prompt:', genResult.prompt)
    console.log('Meta:', JSON.stringify(genResult.meta))
    console.log('Image URL (grid 0):', getImageUrl(genResult.job_id))
    console.log('✓ generate works, job submitted')

    // -----------------------------------------------------------------------
    // 5. getJobStatus
    // -----------------------------------------------------------------------
    console.log('\n=== 5. getJobStatus ===')
    const statuses = await mj.getJobStatus([genResult.job_id])
    console.log('Status count:', statuses.length)
    if (statuses.length > 0) {
      const s = statuses[0]!
      console.log('Job status:', s.current_status, s.job_type, s.width + 'x' + s.height)
    }
    console.log('✓ getJobStatus works')

    // -----------------------------------------------------------------------
    // 6. waitForJob
    // -----------------------------------------------------------------------
    console.log('\n=== 6. waitForJob ===')
    console.log('Waiting for image generation to complete (polling every 3s, timeout 5min)...')
    const completed = await mj.waitForJob(genResult.job_id, { pollInterval: 3000 })
    console.log('Completed! Status:', completed.current_status)
    console.log('Final size:', completed.width + 'x' + completed.height)
    console.log('✓ waitForJob works')

    // -----------------------------------------------------------------------
    // 7. upscale
    // -----------------------------------------------------------------------
    console.log('\n=== 7. upscale ===')
    const upscaleResult = await mj.upscale(genResult.job_id, 0, { type: 'v7_2x_subtle' })
    console.log('Upscale job ID:', upscaleResult.job_id)
    console.log('Upscale type:', upscaleResult.job_type)
    console.log('Upscale meta:', JSON.stringify(upscaleResult.meta))

    console.log('Waiting for upscale to complete...')
    const upscaleCompleted = await mj.waitForJob(upscaleResult.job_id)
    console.log('Upscale completed! Size:', upscaleCompleted.width + 'x' + upscaleCompleted.height)
    console.log('✓ upscale works')

    // -----------------------------------------------------------------------
    // 8. pan
    // -----------------------------------------------------------------------
    console.log('\n=== 8. pan ===')
    const panResult = await mj.pan(genResult.job_id, 0, 'right')
    console.log('Pan job ID:', panResult.job_id)
    console.log('Pan type:', panResult.job_type)
    console.log('Pan meta:', JSON.stringify(panResult.meta))

    console.log('Waiting for pan to complete...')
    const panCompleted = await mj.waitForJob(panResult.job_id)
    console.log('Pan completed! Size:', panCompleted.width + 'x' + panCompleted.height)
    console.log('✓ pan works')

    // -----------------------------------------------------------------------
    // 9. uploadFile
    // -----------------------------------------------------------------------
    console.log('\n=== 9. uploadFile ===')
    // Download the generated image through the browser (CDN blocks direct fetch).
    // Access ensurePage via the private method to reuse the existing connection.
    const page = await (mj as any).ensurePage()
    const base64 = await page.evaluate(async (url: string) => {
      const resp = await fetch(url)
      const buf = await resp.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!)
      return btoa(binary)
    }, getImageUrl(genResult.job_id))
    const testImageBuffer = Buffer.from(base64, 'base64')
    console.log('Downloaded test image:', testImageBuffer.length, 'bytes')
    const uploadResult = await mj.uploadFile(testImageBuffer, 'test-upload.jpeg')
    console.log('Upload shortUrl:', uploadResult.shortUrl)
    console.log('Upload bucketPathname:', uploadResult.bucketPathname)
    console.log('✓ uploadFile works')

    // -----------------------------------------------------------------------
    // 10. generateVideo
    // -----------------------------------------------------------------------
    console.log('\n=== 10. generateVideo ===')
    // Use the uploaded image as starting frame
    const cdnUrl = `https://cdn.midjourney.com/u/${uploadResult.bucketPathname}`
    const videoResult = await mj.generateVideo('gentle camera pan, cinematic', {
      startingFrame: cdnUrl,
      loop: true,
      aspectRatio: '16:9',
    })
    console.log('Video job ID:', videoResult.job_id)
    console.log('Video type:', videoResult.job_type)
    console.log('Video prompt:', videoResult.prompt)
    console.log('Video URL (grid 0):', getVideoUrl(videoResult.job_id))
    console.log('Video thumbnail:', getVideoThumbnailUrl(videoResult.job_id))
    console.log('✓ generateVideo works, job submitted')
    console.log('(Not waiting for video completion, it takes several minutes)')

    // -----------------------------------------------------------------------
    // Summary
    // -----------------------------------------------------------------------
    console.log('\n========================================')
    console.log('ALL METHODS VERIFIED SUCCESSFULLY')
    console.log('========================================')
    console.log('1. getUserId      ✓')
    console.log('2. getStorage     ✓')
    console.log('3. search         ✓')
    console.log('4. generate       ✓')
    console.log('5. getJobStatus   ✓')
    console.log('6. waitForJob     ✓')
    console.log('7. upscale        ✓')
    console.log('8. pan            ✓')
    console.log('9. uploadFile     ✓')
    console.log('10. generateVideo ✓')
  } finally {
    await mj.close()
  }
}

main().catch((err) => {
  console.error('\n✗ FAILED:', err.message)
  console.error(err.stack)
  process.exit(1)
})
