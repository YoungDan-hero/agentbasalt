import type { RunnerConfig, RunResult, SuiteResult, TestResult, TestDefinition, Reporter } from './types.js'
import { TerminalReporter } from './reporter.js'
import { saveAllCassettes, clearEngineRegistry } from './engine.js'
import { readdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'

// ─── Test Registration (global state) ───────────────────────────────

interface Suite {
  name: string
  tests: TestDefinition[]
  beforeAll?: Array<() => Promise<void> | void>
  afterAll?: Array<() => Promise<void> | void>
  beforeEach?: Array<() => Promise<void> | void>
  afterEach?: Array<() => Promise<void> | void>
}

const suites: Suite[] = []
let currentSuite: Suite | null = null
let currentTimeout = 5000

function ensureDefaultSuite(): Suite {
  if (!currentSuite) {
    currentSuite = { name: 'default', tests: [] }
    suites.push(currentSuite)
  }
  return currentSuite
}

/** Define a test suite */
export function describe(name: string, fn: () => void): void {
  const parent = currentSuite
  const suite: Suite = { name, tests: [], beforeAll: [], afterAll: [], beforeEach: [], afterEach: [] }
  currentSuite = suite
  suites.push(suite)
  fn()
  currentSuite = parent
}

/** Define a test case */
export function test(name: string, fn: () => Promise<void> | void, timeout?: number): void {
  const suite = ensureDefaultSuite()
  suite.tests.push({ name, fn, timeout: timeout ?? currentTimeout })
}

/** Alias for test */
export const it = test

/** Set default timeout for subsequent tests */
export function setDefaultTimeout(ms: number): void {
  currentTimeout = ms
}

/** Register a beforeAll hook */
export function beforeAll(fn: () => Promise<void> | void): void {
  const suite = ensureDefaultSuite()
  suite.beforeAll = suite.beforeAll ?? []
  suite.beforeAll.push(fn)
}

/** Register an afterAll hook */
export function afterAll(fn: () => Promise<void> | void): void {
  const suite = ensureDefaultSuite()
  suite.afterAll = suite.afterAll ?? []
  suite.afterAll.push(fn)
}

/** Register a beforeEach hook */
export function beforeEach(fn: () => Promise<void> | void): void {
  const suite = ensureDefaultSuite()
  suite.beforeEach = suite.beforeEach ?? []
  suite.beforeEach.push(fn)
}

/** Register an afterEach hook */
export function afterEach(fn: () => Promise<void> | void): void {
  const suite = ensureDefaultSuite()
  suite.afterEach = suite.afterEach ?? []
  suite.afterEach.push(fn)
}

/** Mark a test as skipped */
export function skip(name: string, fn: () => Promise<void> | void): void {
  const suite = ensureDefaultSuite()
  suite.tests.push({ name, fn, skip: true })
}

/** Mark a test as todo */
export function todo(name: string): void {
  const suite = ensureDefaultSuite()
  suite.tests.push({ name, fn: () => {}, todo: true })
}

test.skip = skip
test.todo = todo

// ─── Test Runner ────────────────────────────────────────────────────

async function discoverTestFiles(dir: string, _patterns?: string[]): Promise<string[]> {
  const testDir = resolve(dir)
  const files: string[] = []

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        await walk(fullPath)
      } else if (entry.isFile() && isTestFile(entry.name)) {
        files.push(fullPath)
      }
    }
  }

  await walk(testDir)
  return files
}

function isTestFile(name: string): boolean {
  return (
    name.endsWith('.spec.ts') ||
    name.endsWith('.test.ts') ||
    name.endsWith('.spec.js') ||
    name.endsWith('.test.js')
  )
}

async function runSingleTest(testDef: TestDefinition, reporter: Reporter): Promise<TestResult> {
  const start = performance.now()

  if (testDef.skip) {
    return {
      name: testDef.name,
      status: 'skip',
      duration: 0,
      assertions: 0,
    }
  }

  if (testDef.todo) {
    return {
      name: testDef.name,
      status: 'todo',
      duration: 0,
      assertions: 0,
    }
  }

  try {
    reporter.onTestStart(testDef.name)

    const timeout = testDef.timeout ?? 5000
    await Promise.race([
      Promise.resolve(testDef.fn()),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Test timed out after ${timeout}ms`)), timeout)
      ),
    ])

    const duration = performance.now() - start
    const testResult: TestResult = {
      name: testDef.name,
      status: 'pass',
      duration,
      assertions: 0, // tracked by expect()
    }
    reporter.onTestEnd(testResult)
    return testResult
  } catch (err) {
    const duration = performance.now() - start
    const testResult: TestResult = {
      name: testDef.name,
      status: 'fail',
      duration,
      error: err instanceof Error ? err : new Error(String(err)),
      assertions: 0,
    }
    reporter.onTestEnd(testResult)
    return testResult
  }
}

async function runSuite(suite: Suite, reporter: Reporter): Promise<SuiteResult> {
  const start = performance.now()
  reporter.onSuiteStart(suite.name)

  // Run beforeAll hooks
  for (const hook of suite.beforeAll ?? []) {
    await hook()
  }

  const results: TestResult[] = []
  for (const testDef of suite.tests) {
    // Run beforeEach hooks
    for (const hook of suite.beforeEach ?? []) {
      await hook()
    }

    const result = await runSingleTest(testDef, reporter)
    results.push(result)

    // Run afterEach hooks
    for (const hook of suite.afterEach ?? []) {
      await hook()
    }
  }

  // Run afterAll hooks
  for (const hook of suite.afterAll ?? []) {
    await hook()
  }

  const suiteResult: SuiteResult = {
    name: suite.name,
    tests: results,
    duration: performance.now() - start,
  }
  reporter.onSuiteEnd(suiteResult)
  return suiteResult
}

/** Run all registered tests */
export async function runTests(config: RunnerConfig): Promise<RunResult> {
  const reporter = new TerminalReporter()

  // Discover test files
  const testDir = process.cwd()
  const files = config.files?.length
    ? config.files.map((f) => resolve(f))
    : await discoverTestFiles(testDir)

  if (files.length === 0) {
    console.log('No test files found. Create files matching *.spec.ts or *.test.ts')
    return {
      suites: [],
      totalTests: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      todo: 0,
      duration: 0,
    }
  }

  // Clear previously registered suites
  suites.length = 0
  currentSuite = null

  // Import test files (this registers their tests)
  for (const file of files) {
    await import(file)
  }

  // Run all suites
  const start = performance.now()
  const suiteResults: SuiteResult[] = []

  for (const suite of suites) {
    const result = await runSuite(suite, reporter)
    suiteResults.push(result)

    if (config.bail && result.tests.some((t) => t.status === 'fail')) {
      break
    }
  }

  const totalDuration = performance.now() - start
  const allTests = suiteResults.flatMap((s) => s.tests)

  const runResult: RunResult = {
    suites: suiteResults,
    totalTests: allTests.length,
    passed: allTests.filter((t) => t.status === 'pass').length,
    failed: allTests.filter((t) => t.status === 'fail').length,
    skipped: allTests.filter((t) => t.status === 'skip').length,
    todo: allTests.filter((t) => t.status === 'todo').length,
    duration: totalDuration,
  }

  reporter.onRunEnd(runResult)

  // Auto-save cassettes in record mode
  if (config.mode === 'record') {
    const savedPaths = await saveAllCassettes()
    if (savedPaths.length > 0) {
      console.log(`\n📼 Saved ${savedPaths.length} cassette(s):`)
      for (const p of savedPaths) {
        console.log(`   ${p}`)
      }
    }
    clearEngineRegistry()
  }

  return runResult
}
