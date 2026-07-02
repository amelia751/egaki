// Auto-generates CLI reference markdown pages from the egaki CLI definition.
// Uses goke's generateDocs() to introspect commands, options, and examples,
// then writes one .md file per command into src/pages/docs/cli/.
//
// Post-processes output to escape angle brackets in prose that MDX would
// interpret as JSX tags (e.g. <id>, <name>, <key>).
import { generateDocs } from 'goke'
import fs from 'node:fs'
import path from 'node:path'

// Import the CLI instance (does not call parse())
const { cli } = await import('egaki/src/cli/cli')

const pages = generateDocs({ cli, basePath: '/docs/cli' })

const outDir = path.join(import.meta.dirname, '..', 'src', 'pages', 'docs', 'cli')
fs.mkdirSync(outDir, { recursive: true })

/**
 * Escape angle brackets in prose lines that MDX would parse as JSX.
 * Skips lines inside fenced code blocks and inline code.
 */
function escapeAngleBrackets(content: string): string {
  const lines = content.split('\n')
  let inCodeBlock = false
  return lines
    .map((line) => {
      if (line.trimStart().startsWith('```')) {
        inCodeBlock = !inCodeBlock
        return line
      }
      if (inCodeBlock) return line
      // Replace <word> patterns in prose (not inside backticks or table cells with backtick-wrapped content)
      // but preserve backtick-wrapped content
      return line.replace(
        /(`[^`]*`)|(<(\w[\w-]*)>)/g,
        (match, backticked, angleBracket, tagName) => {
          if (backticked) return backticked
          // Don't escape known HTML/MDX tags
          const htmlTags = new Set(['br', 'hr', 'img', 'p', 'div', 'span', 'a', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'th', 'thead', 'tbody', 'code', 'pre', 'em', 'strong', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])
          if (htmlTags.has(tagName.toLowerCase())) return match
          return `\\<${tagName}>`
        },
      )
    })
    .join('\n')
}

for (const page of pages) {
  const filePath = path.join(outDir, `${page.slug}.md`)
  fs.writeFileSync(filePath, escapeAngleBrackets(page.content))
  console.log(`wrote ${filePath}`)
}

console.log(`Generated ${pages.length} CLI doc pages`)
