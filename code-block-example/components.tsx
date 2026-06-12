/**
 * CodeBlock theme showcase components.
 * Shows multiple themes in a grid layout for visual comparison.
 */

import { AbsoluteFill } from 'remotion'
import { CodeBlock } from 'egaki/video'

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
        width={900}
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
