// Custom Spiceflow entry for egaki docs.
// Minimal: just mounts holocron. The index.mdx page handles the hero via <Above>.
import './globals.css'
import { Spiceflow } from 'spiceflow'
import { app as holocronApp } from '@holocron.so/vite/app'

export const app = new Spiceflow()
  // The site only has pages under /docs; redirect the root there.
  .get('/', ({ redirect }) => redirect('/docs', { status: 308 }))
  .use(holocronApp)

export default {
  async fetch(request: Request): Promise<Response> {
    return app.handle(request)
  },
}
