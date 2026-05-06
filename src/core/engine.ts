import type {
  AgentBasaltConfig,
  AgentBasaltMode,
  LLMRequest,
  LLMResponse,
  RequestHandler,
  MockResponseEntry,
  MatchStrategy,
} from './types.js'
import { Replayer } from '../mock/replayer.js'
import { Recorder } from '../mock/recorder.js'
import { Matcher } from '../mock/matcher.js'

export class AgentBasaltEngine {
  private mode: AgentBasaltMode
  private cassetteDir: string
  private cassetteName: string
  private mockResponses: MockResponseEntry[]
  private matchStrategy: MatchStrategy
  private replayer: Replayer | null = null
  private recorder: Recorder | null = null

  constructor(config: AgentBasaltConfig = { mode: 'replay' }) {
    this.mode = config.mode
    this.cassetteDir = config.cassetteDir ?? '__cassettes__'
    this.cassetteName = config.cassetteName ?? 'default'
    this.mockResponses = config.mockResponses ?? []
    this.matchStrategy = config.matchStrategy ?? 'contains'

    if (this.mode === 'replay') {
      this.replayer = new Replayer(this.cassetteDir)
    } else if (this.mode === 'record') {
      this.recorder = new Recorder(this.cassetteDir, config.sanitize)
      this.recorder.start(this.cassetteName)
    }
  }

  /**
   * Create a RequestHandler that the adapter uses to intercept LLM calls.
   *
   * Usage in adapter:
   * ```ts
   * const response = await handler.handle(normalizedRequest, async () => {
   *   // This is the real API call — only executed in record/passthrough mode
   *   const raw = await originalClient.chat.completions.create(params)
   *   return normalizeResponse(raw)
   * })
   * ```
   */
  createHandler(): RequestHandler {
    return {
      handle: async (
        request: LLMRequest,
        originalCall: () => Promise<LLMResponse>,
      ): Promise<LLMResponse> => {
        switch (this.mode) {
          case 'mock':
            return this.handleMock(request)
          case 'replay':
            return this.handleReplay(request)
          case 'record':
            return this.handleRecord(request, originalCall)
          case 'passthrough':
            return originalCall()
          default:
            throw new Error(`Unknown mode: ${this.mode}`)
        }
      },
    }
  }

  /** @deprecated Use createHandler() instead */
  createInterceptor() {
    const handler = this.createHandler()
    return {
      onRequest: (request: LLMRequest) =>
        handler.handle(request, async () => {
          throw new Error(
            'No real API call available in mock/replay mode. ' +
            'Use createHandler() and pass originalCall for record mode.'
          )
        }),
    }
  }

  private handleMock(request: LLMRequest): LLMResponse {
    const matcher = new Matcher(this.matchStrategy)
    const entry = this.mockResponses.find((e) => matcher.match(request, e.match))

    if (!entry) {
      throw new Error(
        `No mock response found for request. ` +
        `Last user message: "${this.getLastUserMessage(request)}". ` +
        `Add a mock response or use record mode.`
      )
    }

    return {
      content: entry.response.content ?? '',
      toolCalls: entry.response.toolCalls ?? [],
      usage: entry.response.usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: entry.response.model ?? request.model,
      finishReason: entry.response.finishReason ?? 'stop',
      raw: entry.response.raw ?? null,
    }
  }

  private async handleReplay(request: LLMRequest): Promise<LLMResponse> {
    if (!this.replayer) {
      throw new Error('Replayer not initialized')
    }
    const response = await this.replayer.findResponse(request)
    if (!response) {
      throw new Error(
        `No recorded response found for request. ` +
        `Run "agentbasalt record" first to record responses.`
      )
    }
    return response
  }

  private async handleRecord(
    request: LLMRequest,
    originalCall: () => Promise<LLMResponse>,
  ): Promise<LLMResponse> {
    if (!this.recorder) {
      throw new Error('Recorder not initialized')
    }

    const start = performance.now()
    const response = await originalCall()
    const duration = performance.now() - start

    this.recorder.record(request, response, duration)
    return response
  }

  /** Save recorded cassettes to disk (call after all tests complete) */
  async saveCassettes(): Promise<string | null> {
    if (!this.recorder || this.mode !== 'record') return null
    return this.recorder.save()
  }

  getRecorder(): Recorder | null {
    return this.recorder
  }

  getReplayer(): Replayer | null {
    return this.replayer
  }

  getMode(): AgentBasaltMode {
    return this.mode
  }

  private getLastUserMessage(request: LLMRequest): string {
    const userMessages = request.messages.filter((m) => m.role === 'user')
    const last = userMessages[userMessages.length - 1]
    return last?.content?.slice(0, 100) ?? '(empty)'
  }
}

/** Create an AgentBasalt engine instance */
export function agentBasalt(config?: AgentBasaltConfig): AgentBasaltEngine {
  return new AgentBasaltEngine(config)
}

/** Helper for typed config (used in agentbasalt.config.ts) */
export function defineConfig(config: AgentBasaltConfig): AgentBasaltConfig {
  return config
}
