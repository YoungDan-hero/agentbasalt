#!/usr/bin/env node

import { parseArgs } from 'node:util'
import { runTests } from '../core/runner.js'
import { initProject } from './init.js'
import { recordTests } from './record.js'
import { updateSnapshots } from './update.js'

const { values, positionals } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: 'boolean', short: 'h' },
    record: { type: 'boolean', short: 'r' },
    replay: { type: 'boolean' },
    update: { type: 'boolean', short: 'u' },
    reporter: { type: 'string' },
    watch: { type: 'boolean', short: 'w' },
  },
  allowPositionals: true,
  strict: false,
})

const command = positionals[0]

if (values.help || !command) {
  printHelp()
  process.exit(0)
}

async function main() {
  try {
    switch (command) {
      case 'init':
        await initProject()
        break
      case 'test':
        await runTests({
          mode: values.record ? 'record' : 'replay',
          reporter: (values.reporter as string) ?? 'terminal',
          watch: values.watch as boolean,
          files: positionals.slice(1),
        })
        break
      case 'record':
        await recordTests({
          files: positionals.slice(1),
        })
        break
      case 'update':
        await updateSnapshots({
          files: positionals.slice(1),
        })
        break
      default:
        console.error(`Unknown command: ${command}`)
        printHelp()
        process.exit(1)
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

function printHelp() {
  console.log(`
agentbasalt — Test your AI agents like you test your code.

Usage:
  agentbasalt <command> [options]

Commands:
  init                 Initialize agentbasalt in your project
  test [files...]      Run agent tests (default: replay mode)
  record [files...]    Record new cassettes from real API calls
  update [files...]    Update existing snapshots

Options:
  -r, --record         Run in record mode (calls real APIs)
  --replay             Run in replay mode (default, uses cassettes)
  -u, --update         Update snapshots
  --reporter <type>    Reporter: terminal | html (default: terminal)
  -w, --watch          Watch mode
  -h, --help           Show this help
`)
}

main()
