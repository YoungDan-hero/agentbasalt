import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { LLMRequest, LLMResponse, Cassette, Interaction, SanitizeConfig } from '../core/types.js'

export class Recorder {
  private interactions: Interaction[] = []
  private cassetteName: string | null = null

  constructor(
    private cassetteDir: string,
    private sanitizeConfig?: SanitizeConfig,
  ) {}

  /** Start recording a new cassette */
  start(name: string): void {
    this.cassetteName = name
    this.interactions = []
  }

  /** Record an API request/response pair */
  record(request: LLMRequest, response: LLMResponse, duration: number): void {
    const interaction: Interaction = {
      request: this.sanitizeRequest(request),
      response: this.sanitizeResponse(response),
      timestamp: Date.now(),
      duration,
    }
    this.interactions.push(interaction)
  }

  /** Save the recorded cassette to disk */
  async save(): Promise<string> {
    if (!this.cassetteName) {
      throw new Error('No cassette name set. Call recorder.start(name) first.')
    }

    const cassette: Cassette = {
      id: this.generateId(),
      name: this.cassetteName,
      recordedAt: new Date().toISOString(),
      agentBasaltVersion: '0.1.0',
      interactions: this.interactions,
    }

    const dir = join(process.cwd(), this.cassetteDir)
    await mkdir(dir, { recursive: true })

    const filePath = join(dir, `${this.cassetteName}.json`)
    await writeFile(filePath, JSON.stringify(cassette, null, 2), 'utf-8')

    return filePath
  }

  /** Get the number of recorded interactions */
  get count(): number {
    return this.interactions.length
  }

  // ─── Sanitization ───────────────────────────────────────────────

  private sanitizeRequest(request: LLMRequest): LLMRequest {
    return {
      ...request,
      messages: request.messages.map((m) => ({
        ...m,
        content: this.sanitizeText(m.content),
      })),
    }
  }

  private sanitizeResponse(response: LLMResponse): LLMResponse {
    return {
      ...response,
      content: this.sanitizeText(response.content),
      raw: null, // Don't store raw response (may contain sensitive data)
    }
  }

  private sanitizeText(text: string): string {
    if (!this.sanitizeConfig) return text

    let result = text

    if (this.sanitizeConfig.maskApiKeys) {
      // Mask common API key patterns
      result = result.replace(
        /(?:sk-|key-|token-|bearer\s+)[a-zA-Z0-9_-]{20,}/gi,
        '[MASKED_API_KEY]',
      )
    }

    if (this.sanitizeConfig.maskEmails) {
      result = result.replace(
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        '[MASKED_EMAIL]',
      )
    }

    for (const sanitizer of this.sanitizeConfig.customSanitizers ?? []) {
      result = sanitizer(result)
    }

    return result
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}
