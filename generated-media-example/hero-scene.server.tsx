// Server component that uses GeneratedImage inside a TSX file.
// The .server.tsx postfix ensures this file is never bundled to the browser.
// Must be used inside a <Server> block in MDX so it runs in the RSC environment.
// Import from 'egaki/generate-media' (the real async server implementations),
// NOT from 'egaki/video' (which exports client stubs that return null).
import { GeneratedImage } from 'egaki/generate-media'
import { FadeIn, Fill } from 'egaki/video'

export async function HeroScene() {
  return (
    <Fill>
      <FadeIn duration={20}>
        <GeneratedImage
          prompt="a magical forest with glowing mushrooms and fireflies, fantasy art style"
          seed={99}
          model="imagen-4.0-generate-001"
          style={{ width: '80%', margin: 'auto', borderRadius: 16, objectFit: 'cover' }}
        />
      </FadeIn>
      <div style={{ textAlign: 'center', fontSize: 48, marginTop: 20, color: '#fafafa' }}>
        Generated from TSX server component
      </div>
    </Fill>
  )
}
