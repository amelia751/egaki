// Vite config for the Claude x Autodesk Fusion launch video recreation
import { video } from 'egaki/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [video({ entry: './video.mdx' })],
})
