#!/usr/bin/env node
// Entrypoint that imports the CLI instance and runs it.
// cli.ts defines all commands but does not call parse() so that
// other tools (like goke's generateDocs) can import the CLI without
// triggering argument parsing.
import { cli } from './cli.js'

await cli.parse()
