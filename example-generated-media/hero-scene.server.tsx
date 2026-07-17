// Server component that uses GeneratedImage inside a TSX file.
// The .server.tsx postfix ensures this file is never bundled to the browser.
// When imported from MDX, egaki auto-wraps it in a synthetic <Server> node
// so it runs in the RSC environment without needing a manual <Server> block.
// Import from 'egaki/generate-media' (the real async server implementations),
// NOT from 'egaki/video' (which exports client stubs that return null).
import { GeneratedImage } from 'egaki/generate-media'
import { Opacity, Fill } from 'egaki/video'

export async function HeroScene() {
  return (
    <Fill>
      <Opacity from={0} to={1} duration={20} label="hero-fade">
        <GeneratedImage
          prompt="a magical forest with glowing mushrooms and fireflies, fantasy art style"
          seed={99}
          model="imagen-4.0-generate-001"
          style={{ width: '80%', margin: 'auto', borderRadius: 16, objectFit: 'cover' }}
        />
      </Opacity>
      <div style={{ textAlign: 'center', fontSize: 48, marginTop: 20, color: '#fafafa' }}>
        Generated from TSX server component
      </div>
    </Fill>
  )
}
