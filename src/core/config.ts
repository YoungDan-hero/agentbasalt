import { readFile, access } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { AgentBasaltConfig } from './types.js'

const CONFIG_FILE_NAMES = [
  'agentbasalt.config.ts',
  'agentbasalt.config.js',
  'agentbasalt.config.mjs',
  '.agentbasalt.yaml',
  '.agentbasalt.json',
]

export interface ResolvedConfig extends AgentBasaltConfig {
  cassetteDir: string
  testDir: string
  testPattern: string
}

const DEFAULT_CONFIG: ResolvedConfig = {
  mode: 'replay',
  cassetteDir: '__cassettes__',
  testDir: '.',
  testPattern: '**/*.{spec,test}.{ts,js}',
}

/** Load config from the project root */
export async function loadConfig(rootDir?: string): Promise<ResolvedConfig> {
  const root = rootDir ?? process.cwd()

  for (const fileName of CONFIG_FILE_NAMES) {
    const filePath = resolve(root, fileName)
    try {
      await access(filePath)
      const config = await loadConfigFile(filePath)
      return { ...DEFAULT_CONFIG, ...config }
    } catch {
      // File doesn't exist, try next
    }
  }

  return DEFAULT_CONFIG
}

async function loadConfigFile(filePath: string): Promise<Partial<AgentBasaltConfig>> {
  const ext = filePath.split('.').pop()

  if (ext === 'json') {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content)
  }

  if (ext === 'ts' || ext === 'js' || ext === 'mjs') {
    // Dynamic import for TS/JS config files
    const mod = await import(filePath)
    return mod.default ?? mod
  }

  // YAML
  throw new Error(`Config file format .${ext} not yet supported. Use .json or .ts`)
}

/** Get config from environment variables */
export function getEnvConfig(): Partial<AgentBasaltConfig> {
  const config: Partial<AgentBasaltConfig> = {}

  if (process.env.AGENTBASALT_MODE) {
    config.mode = process.env.AGENTBASALT_MODE as AgentBasaltConfig['mode']
  }

  if (process.env.AGENTBASALT_CASSETTE_DIR) {
    config.cassetteDir = process.env.AGENTBASALT_CASSETTE_DIR
  }

  return config
}
