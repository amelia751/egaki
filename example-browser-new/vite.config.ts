// Vite config for the browser-new Jitter recreation example (Frame 168)
import { video } from 'egaki/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [video({ entry: './video.mdx' })],
  server: { port: 5202 },
})