import { defineConfig } from 'vite'
import { video } from 'egaki/vite'

// Vite config for the Mango release-notes Jitter recreation example.
export default defineConfig({
  plugins: [video({ entry: './video.mdx' })],
})
