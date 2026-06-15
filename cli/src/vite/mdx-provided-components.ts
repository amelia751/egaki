/**
 * Global MDXProvidedComponents type for MDX LSP support.
 *
 * The MDX analyzer (mdx-analyzer / vscode-mdx) uses the special global type
 * `MDXProvidedComponents` to know which components are available in MDX files
 * without explicit imports. This file declares that type from the same
 * MDX_BUILTIN_COMPONENTS map that the runtime uses, keeping them in sync.
 *
 * Projects opt in by having an `egaki-env.d.ts` with:
 *   /// <reference types="egaki/mdx-components" />
 *
 * The egaki vite plugin auto-generates this file on first run.
 */

import { MDX_BUILTIN_COMPONENTS } from './mdx-video.tsx'

declare global {
  type MDXProvidedComponents = typeof MDX_BUILTIN_COMPONENTS
}
