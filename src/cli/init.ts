import { writeFile, mkdir, access } from 'node:fs/promises'
import { resolve } from 'node:path'

const EXAMPLE_CONFIG = `import { defineConfig } from 'agentbasalt'

export default defineConfig({
  mode: 'replay',
  cassetteDir: '__cassettes__',
  testDir: 'tests',
  testPattern: '**/*.spec.ts',
})
`

const EXAMPLE_TEST = `import { test, expect, agentBasalt } from 'agentbasalt'

// Example: test a simple agent
test('agent responds to greeting', async () => {
  const engine = agentBasalt({
    mode: 'mock',
    mockResponses: [
      {
        match: { contains: 'hello' },
        response: { content: 'Hi there! How can I help you?' },
      },
    ],
  })

  // Your agent code here
  // const result = await myAgent.run('hello')
  // expect(result).toHaveRespondedContaining('Hi there')
})
`

export async function initProject(): Promise<void> {
  const cwd = process.cwd()

  // Create config file
  const configPath = resolve(cwd, 'agentbasalt.config.ts')
  try {
    await access(configPath)
    console.log('agentbasalt.config.ts already exists, skipping')
  } catch {
    await writeFile(configPath, EXAMPLE_CONFIG, 'utf-8')
    console.log('Created agentbasalt.config.ts')
  }

  // Create test directory
  const testDir = resolve(cwd, 'tests')
  try {
    await access(testDir)
  } catch {
    await mkdir(testDir, { recursive: true })
    console.log('Created tests/ directory')
  }

  // Create example test
  const testPath = resolve(testDir, 'example.spec.ts')
  try {
    await access(testPath)
    console.log('tests/example.spec.ts already exists, skipping')
  } catch {
    await writeFile(testPath, EXAMPLE_TEST, 'utf-8')
    console.log('Created tests/example.spec.ts')
  }

  // Create cassettes directory
  const cassetteDir = resolve(cwd, '__cassettes__')
  try {
    await access(cassetteDir)
  } catch {
    await mkdir(cassetteDir, { recursive: true })
    console.log('Created __cassettes__/ directory')
  }

  console.log(`
AgentBasalt initialized!

Next steps:
  1. Edit tests/example.spec.ts with your agent tests
  2. Run: npx agentbasalt test
  3. Record real API responses: npx agentbasalt test --record
`)
}
