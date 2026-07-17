/**
 * CodeBlock theme showcase components.
 * Shows multiple themes in a grid layout for visual comparison.
 */

import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { CodeBlock, AngledScreen, EASE, Fill } from 'egaki/video'

const SAMPLE_CODE = `import { createServer } from 'node:http'

const server = createServer((req, res) => {
  // Handle incoming requests
  const url = new URL(req.url, 'http://localhost')
  const name = url.searchParams.get('name') ?? 'world'

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ message: \`Hello, \${name}!\` }))

})

server.listen(3000, () => {
  console.log('Server running on port 3000')
})`

const SHORT_CODE = `const greet = (name: string) => {
  console.log(\`Hello, \${name}!\`)
}

greet('world') // Hello, world!`

export function ThemeGrid({ themes }: { themes: string[] }) {
  return (
    <AbsoluteFill style={{
      display: 'flex',
      flexWrap: 'wrap',
      gap: 24,
      padding: 40,
      alignItems: 'flex-start',
      justifyContent: 'center',
      alignContent: 'center',
    }}>
      {themes.map((theme) => (
        <CodeBlock
          key={theme}
          theme={theme}
          title={`${theme}.ts`}
          width={560}
          fontSize={12}
          showLineNumbers
        >
          {SHORT_CODE}
        </CodeBlock>
      ))}
    </AbsoluteFill>
  )
}

export function SingleTheme({ theme, title }: { theme: string; title?: string }) {
  return (
    <AbsoluteFill style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <CodeBlock
        theme={theme}
        title={title || `example.ts`}
        width={'100%'}
        fontSize={16}
        showLineNumbers
        showBackground
      >
        {SAMPLE_CODE}
      </CodeBlock>
    </AbsoluteFill>
  )
}

export function HighlightDemo() {
  return (
    <AbsoluteFill style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <CodeBlock
        theme="stripe"
        title="server.ts"
        width={900}
        fontSize={16}
        showLineNumbers
        highlightLines={[4, 5, 6]}
      >
        {SAMPLE_CODE}
      </CodeBlock>
    </AbsoluteFill>
  )
}

export function AnimatedCodeBlock() {
  return (
    <AbsoluteFill style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <CodeBlock
        title="animated.ts"
        width={900}
        fontSize={16}
        showLineNumbers
        staggerFrames={2}
      >
        {SAMPLE_CODE}
      </CodeBlock>
    </AbsoluteFill>
  )
}

export function AngledCodeBlock({ theme = 'stripe' }: { theme?: string }) {
  const frame = useCurrentFrame()

  const translateX = interpolate(frame, [0, 90], [-50, 50], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.cinematic,
  })

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <AngledScreen
        rotateX={10}
        rotateY={-18}
        translateZ={200}
        perspective={800}
        bokehBlur={8}
        bokehOffset={0.6}
        backgroundColor="#0a0a0a"
        width="100%"
        height="100%"
        style={{ transform: `translateX(${translateX}px)` }}
      >
        <CodeBlock
          theme={theme}
          title="server.ts"
          width="100%"
          height="100%"
          showLineNumbers
          fontSize={14}
        >
          {SAMPLE_CODE}
        </CodeBlock>
      </AngledScreen>
    </AbsoluteFill>
  )
}

export function ZoomedHighlight() {
  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <div style={{
        width: '100%',
        height: '100%',
        transform: 'scale(1.35)',
        transformOrigin: '60% 45%',
        willChange: 'transform',
      }}>
        <CodeBlock
          theme="vercel"
          title="server.ts"
          width="100%"
          height="100%"
          showLineNumbers
          fontSize={16}
          highlightLines={[8, 9]}
        >
          {SAMPLE_CODE}
        </CodeBlock>
      </div>
    </AbsoluteFill>
  )
}

export function ZoomingCodeBlock() {
  const frame = useCurrentFrame()

  // Fast cinematic zoom-in over 1.5s
  const zoomIn = interpolate(frame, [0, 45], [1, 1.35], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.cinematic,
  })

  // Slow linear drift from -0.08 to 0 over the full scene so it never feels static.
  // Ends at 0 so final scale is exactly 1.35, matching the next scene's zoom level.
  const drift = interpolate(frame, [0, 90], [-0.08, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })

  const s = Math.round((zoomIn + drift) * 1000) / 1000

  return (
    <Fill style={{ backgroundColor: '#000' }}>
      <div style={{
        width: '100%',
        height: '100%',
        transform: `scale(${s})`,
        transformOrigin: '60% 45%',
        willChange: 'transform',
      }}>
        <CodeBlock
          theme="vercel"
          title="server.ts"
          width="100%"
          height="100%"
          showLineNumbers
          fontSize={16}
        >
          {SAMPLE_CODE}
        </CodeBlock>
      </div>
    </Fill>
  )
}

export function SlowZoomCode({ theme = 'openai', originX = '50%', originY = '40%' }: {
  theme?: string
  originX?: string
  originY?: string
}) {
  const frame = useCurrentFrame()

  const scale = interpolate(frame, [0, 90], [1, 2], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: EASE.decelerate,
  })
  const s = Math.round(scale * 1000) / 1000

  return (
    <AbsoluteFill style={{ backgroundColor: '#0a0a0a' }}>
      <div style={{
        width: '100%',
        height: '100%',
        transform: `scale(${s})`,
        transformOrigin: `${originX} ${originY}`,
        willChange: 'transform',
      }}>
        <CodeBlock
          theme={theme}
          title="server.ts"
          width="100%"
          height="100%"
          showLineNumbers
          fontSize={16}
        >
          {SAMPLE_CODE}
        </CodeBlock>
      </div>
    </AbsoluteFill>
  )
}
