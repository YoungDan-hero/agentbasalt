import { BaseAdapter } from './base.js'
import type {
  RequestHandler,
  AgentResult,
  LLMRequest,
  LLMResponse,
  ToolCall,
  Usage,
} from '../core/types.js'

// ─── Vercel AI SDK Types (minimal) ──────────────────────────────────

interface VercelAIModel {
  doGenerate?: (params: VercelAIGenerateParams) => Promise<VercelAIGenerateResult>
  doStream?: (params: VercelAIGenerateParams) => Promise<VercelAIStreamResult>
  [key: string]: unknown
}

interface VercelAIGenerateParams {
  prompt?: Array<{ role: string; content: string }>
  messages?: Array<{ role: string; content: string }>
  model?: string
  maxTokens?: number
  temperature?: number
  tools?: Record<string, unknown>
  [key: string]: unknown
}

interface VercelAIGenerateResult {
  text?: string
  toolCalls?: Array<{
    toolCallType: 'function'
    toolCallId: string
    toolName: string
    args: Record<string, unknown>
  }>
  usage?: { promptTokens: number; completionTokens: number }
  finishReason?: string
  response?: { messages: unknown[] }
  [key: string]: unknown
}

interface VercelAIStreamResult {
  stream: AsyncIterable<{
    type: string
    textDelta?: string
    finishReason?: string
    usage?: { promptTokens: number; completionTokens: number }
  }>
  rawCall?: { rawPrompt: unknown; rawSettings: Record<string, unknown> }
}

// ─── Adapter ────────────────────────────────────────────────────────

/**
 * Adapter for the Vercel AI SDK (ai package).
 *
 * Usage:
 * ```ts
 * import { wrapVercelAI } from 'agentbasalt/adapters/vercel-ai'
 * import { openai } from '@ai-sdk/openai'
 *
 * const model = wrapVercelAI(openai('gpt-4'), handler)
 * ```
 */
export class VercelAIAdapter extends BaseAdapter {
  name = 'vercel-ai'
  provider = 'vercel-ai'

  wrapClient(client: VercelAIModel, handler: RequestHandler): VercelAIModel {
    const originalDoGenerate = client.doGenerate?.bind(client)
    const originalDoStream = client.doStream?.bind(client)

    if (client.doGenerate) {
      client.doGenerate = async (params: VercelAIGenerateParams): Promise<VercelAIGenerateResult> => {
        const request = this.toRequest(params)

        const response = await handler.handle(request, async () => {
          if (!originalDoGenerate) throw new Error('doGenerate not available')
          const raw = await originalDoGenerate(params)
          return this.fromGenerateResult(raw)
        })

        return this.toGenerateResult(response)
      }
    }

    if (client.doStream) {
      client.doStream = async (params: VercelAIGenerateParams): Promise<VercelAIStreamResult> => {
        const request = this.toRequest(params)

        const response = await handler.handle(request, async () => {
          if (!originalDoStream) throw new Error('doStream not available')
          const raw = await originalDoStream(params)
          // For stream, we need to collect the full response
          let content = ''
          for await (const chunk of raw.stream) {
            if (chunk.textDelta) content += chunk.textDelta
          }
          return {
            content,
            toolCalls: [],
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            model: 'unknown',
            finishReason: 'stop' as const,
            raw,
          }
        })

        return this.toStreamResult(response)
      }
    }

    return client
  }

  extractResult(response: unknown): AgentResult {
    const res = response as VercelAIGenerateResult

    return {
      content: res.text ?? '',
      toolCalls: this.extractToolCalls(res),
      usage: this.extractUsage(res),
      duration: 0,
      model: 'unknown',
      finishReason: this.mapFinishReason(res.finishReason),
      steps: [],
      raw: res,
    }
  }

  toRequest(params: VercelAIGenerateParams): LLMRequest {
    const rawMessages = params.prompt ?? params.messages ?? []
    return {
      messages: rawMessages.map((m) => ({
        role: m.role as 'user' | 'assistant' | 'system' | 'tool',
        content: m.content,
      })),
      model: 'unknown',
      maxTokens: params.maxTokens,
    }
  }

  fromGenerateResult(res: VercelAIGenerateResult): LLMResponse {
    return {
      content: res.text ?? '',
      toolCalls: this.extractToolCalls(res),
      usage: this.extractUsage(res),
      model: 'unknown',
      finishReason: this.mapFinishReason(res.finishReason),
      raw: res,
    }
  }

  toGenerateResult(response: LLMResponse): VercelAIGenerateResult {
    return {
      text: response.content,
      toolCalls: (response.toolCalls ?? []).map((tc) => ({
        toolCallType: 'function' as const,
        toolCallId: tc.id,
        toolName: tc.name,
        args: tc.arguments,
      })),
      usage: {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
      },
      finishReason: response.finishReason === 'tool_calls' ? 'tool-calls' : 'stop',
    }
  }

  toStreamResult(response: LLMResponse): VercelAIStreamResult {
    const content = response.content
    return {
      stream: (async function* () {
        yield { type: 'text-delta', textDelta: content }
        yield {
          type: 'finish',
          finishReason: response.finishReason === 'tool_calls' ? 'tool-calls' : 'stop',
          usage: {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
          },
        }
      })(),
      rawCall: { rawPrompt: null, rawSettings: {} },
    }
  }

  private extractToolCalls(res: VercelAIGenerateResult): ToolCall[] {
    return (res.toolCalls ?? []).map((tc) => ({
      id: tc.toolCallId,
      name: tc.toolName,
      arguments: tc.args,
    }))
  }

  private extractUsage(res: VercelAIGenerateResult): Usage {
    const u = res.usage
    return {
      promptTokens: u?.promptTokens ?? 0,
      completionTokens: u?.completionTokens ?? 0,
      totalTokens: (u?.promptTokens ?? 0) + (u?.completionTokens ?? 0),
    }
  }

  private mapFinishReason(reason: string | undefined): LLMResponse['finishReason'] {
    if (reason === 'tool-calls') return 'tool_calls'
    if (reason === 'length') return 'length'
    return 'stop'
  }
}

/** Convenience function to wrap a Vercel AI model */
export function wrapVercelAI(model: VercelAIModel, handler: RequestHandler): VercelAIModel {
  return new VercelAIAdapter().wrapClient(model, handler)
}
