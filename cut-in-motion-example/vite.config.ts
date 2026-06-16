// Vite config for the cut-in-motion example — text scenes with offset-based
// SlideOut/SlideIn in the same direction to demonstrate "cut on motion" transitions.
import { video } from 'egaki/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [video({ entry: './video.mdx' })],
})
