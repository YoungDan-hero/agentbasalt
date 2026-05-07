import type { Reporter, SuiteResult, TestResult, RunResult } from './types.js'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const CYAN = '\x1b[36m'
const GRAY = '\x1b[90m'

export class TerminalReporter implements Reporter {
  private indent = 0

  onSuiteStart(name: string): void {
    this.indent = 1
    console.log(`\n${BOLD}${name}${RESET}`)
  }

  onSuiteEnd(_result: SuiteResult): void {
    this.indent = 0
  }

  onTestStart(_name: string): void {
    // noop — we report on end
  }

  onTestEnd(result: TestResult): void {
    const prefix = '  '.repeat(this.indent)
    const icon = this.getIcon(result.status)
    const duration = result.status !== 'skip' && result.status !== 'todo'
      ? ` ${GRAY}(${this.formatDuration(result.duration)})${RESET}`
      : ''

    console.log(`${prefix}${icon} ${result.name}${duration}`)

    if (result.error) {
      const lines = result.error.message.split('\n')
      for (const line of lines) {
        console.log(`${prefix}  ${RED}${line}${RESET}`)
      }
      if (result.error.stack) {
        const stackLines = result.error.stack.split('\n').slice(1, 4)
        for (const line of stackLines) {
          console.log(`${prefix}  ${GRAY}${line.trim()}${RESET}`)
        }
      }
    }
  }

  onRunEnd(result: RunResult): void {
    console.log('')

    // Summary line
    const parts: string[] = []
    if (result.passed > 0) parts.push(`${GREEN}${result.passed} passed${RESET}`)
    if (result.failed > 0) parts.push(`${RED}${result.failed} failed${RESET}`)
    if (result.skipped > 0) parts.push(`${YELLOW}${result.skipped} skipped${RESET}`)
    if (result.todo > 0) parts.push(`${CYAN}${result.todo} todo${RESET}`)

    console.log(`${BOLD}${parts.join(', ')}${RESET} ${GRAY}(${this.formatDuration(result.duration)})${RESET}`)

    if (result.failed > 0) {
      console.log(`\n${RED}${BOLD}FAIL${RESET}`)
      process.exitCode = 1
    } else {
      console.log(`\n${GREEN}${BOLD}PASS${RESET}`)
    }
  }

  private getIcon(status: TestResult['status']): string {
    switch (status) {
      case 'pass':
        return `${GREEN}✓${RESET}`
      case 'fail':
        return `${RED}✗${RESET}`
      case 'skip':
        return `${YELLOW}○${RESET}`
      case 'todo':
        return `${CYAN}○${RESET}`
    }
  }

  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`
    return `${(ms / 1000).toFixed(2)}s`
  }
}

// ─── HTML Reporter (placeholder) ────────────────────────────────────

export class HtmlReporter implements Reporter {
  onSuiteStart(_name: string): void {}
  onSuiteEnd(_result: SuiteResult): void {}
  onTestStart(_name: string): void {}
  onTestEnd(_result: TestResult): void {}

  onRunEnd(_result: RunResult): void {
    // TODO: generate HTML report
    console.log('HTML report generation not yet implemented')
  }
}
