import { readFile, readdir, access } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import type { LLMRequest, LLMResponse, Cassette, MatchStrategy } from '../core/types.js'
import { Matcher } from './matcher.js'

export class Replayer {
  private cassettes = new Map<string, Cassette>()
  private matcher: Matcher
  private cassetteDir: string

  constructor(cassetteDir: string, matchStrategy: MatchStrategy = 'contains') {
    this.cassetteDir = isAbsolute(cassetteDir) ? cassetteDir : join(process.cwd(), cassetteDir)
    this.matcher = new Matcher(matchStrategy)
  }

  /** Load all cassettes from the cassette directory */
  async loadAll(): Promise<void> {
    try {
      await access(this.cassetteDir)
    } catch {
      // Directory doesn't exist — no cassettes to load
      return
    }

    const files = await readdir(this.cassetteDir)
    const jsonFiles = files.filter((f) => f.endsWith('.json'))

    for (const file of jsonFiles) {
      await this.loadCassette(file)
    }
  }

  /** Load a single cassette by filename */
  async loadCassette(filename: string): Promise<Cassette> {
    const filePath = filename.includes('/')
      ? filename
      : join(this.cassetteDir, filename)

    const content = await readFile(filePath, 'utf-8')
    const cassette = JSON.parse(content) as Cassette
    this.cassettes.set(cassette.name, cassette)
    return cassette
  }

  /** Find a matching response for a request */
  async findResponse(request: LLMRequest): Promise<LLMResponse | null> {
    // Ensure cassettes are loaded
    if (this.cassettes.size === 0) {
      await this.loadAll()
    }

    // Search through all cassettes
    for (const cassette of this.cassettes.values()) {
      const match = this.matcher.findBestMatch(
        request,
        cassette.interactions,
      )

      if (match) {
        // Find the full interaction to get the response
        const interaction = cassette.interactions.find(
          (i) => i.request === match.request,
        )
        if (interaction) {
          return interaction.response
        }
      }
    }

    return null
  }

  /** Check if a cassette exists */
  hasCassette(name: string): boolean {
    return this.cassettes.has(name)
  }

  /** Get a cassette by name */
  getCassette(name: string): Cassette | undefined {
    return this.cassettes.get(name)
  }

  /** List all loaded cassette names */
  listCassettes(): string[] {
    return Array.from(this.cassettes.keys())
  }

  /** Clear loaded cassettes from memory */
  clear(): void {
    this.cassettes.clear()
  }
}
