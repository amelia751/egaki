/**
 * Spiceflow entry for the video framework.
 *
 * The server's only job is delivering the raw MDX source string to the
 * client through the RSC flight payload. All MDX processing (parsing,
 * section splitting, module resolution, safe-mdx rendering) happens in
 * the browser inside MdxClientApp (mdx-client.tsx, 'use client').
 *
 * Rendering on the client means MDX expression props can be functions
 * (easing={x => x}) and user components don't need 'use client' — there
 * is no RSC serialization boundary between MDX content and components.
 *
 * Server components will come back later as explicit <Server> slots
 * rendered here and spliced into the client tree.
 *
 * NOTE: Relative imports MUST include file extensions (.tsx, .ts) for the
 * RSC module runner to resolve them correctly within noExternal packages.
 */

import { Spiceflow } from 'spiceflow'
import mdxSource from 'virtual:egaki-mdx'
import { MdxClientApp } from './mdx-client.tsx'

export const app = new Spiceflow()
  .page('/', () => <MdxClientApp mdx={mdxSource} />)
