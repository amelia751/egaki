import { video } from 'egaki/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [video({ entry: './video.mdx' })],
  resolve: {
    dedupe: ['react', 'react-dom', 'remotion'],
  },
})
