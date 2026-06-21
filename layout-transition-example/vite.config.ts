// Vite config for the intra-scene LayoutTransition example
import { video } from 'egaki/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [video({ entry: './video.mdx' })],
})
