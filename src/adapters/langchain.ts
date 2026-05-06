import { BaseAdapter } from './base.js'
import type {
  RequestHandler,
  AgentResult,
  LLMRequest,
  LLMResponse,
  ToolCall,
} from '../core/types.js'

// ─── LangChain Types (minimal) ──────────────────────────────────────

interface LangChainMessage {
  _getType(): string
  content: string
  name?: string
  tool_calls?: Array<{ name: string; args: Record<string, unknown>; id: string }>
}

interface LangChainModel {
  invoke(input: unknown, options?: unknown): Promise<LangChainMessage>
  generate?(messages: unknown[], options?: unknown): Promise<LangChainGenerateResult>
  [key: string]: unknown
}

interface LangChainGenerateResult {
  generations: Array<Array<{ text: string; message?: LangChainMessage }>>
  llmOutput?: {
    tokenUsage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    }
  }
}

// ─── Adapter ────────────────────────────────────────────────────────

/**
 * Adapter for LangChain.
 *
 * Usage:
 * ```ts
 * import { wrapLangChain } from 'agentbasalt/adapters/langchain'
 * import { ChatOpenAI } from '@langchain/openai'
 *
 * const model = new ChatOpenAI({ modelName: 'gpt-4' })
 * const wrapped = wrapLangChain(model, handler)
 * ```
 */
export class LangChainAdapter extends BaseAdapter {
  name = 'langchain'
  provider = 'langchain'

  wrapClient(client: LangChainModel, handler: RequestHandler): LangChainModel {
    const originalInvoke = client.invoke?.bind(client)
    const originalGenerate = client.generate?.bind(client)

    if (client.invoke) {
      client.invoke = async (input: unknown, _options?: unknown): Promise<LangChainMessage> => {
        const request = this.invokeToRequest(input)

        const response = await handler.handle(request, async () => {
          if (!originalInvoke) throw new Error('invoke not available')
          const raw = await originalInvoke(input)
          return this.fromInvokeResult(raw)
        })

        return this.toInvokeResult(response)
      }
    }

    if (client.generate) {
      client.generate = async (messages: unknown[], _options?: unknown): Promise<LangChainGenerateResult> => {
        const request = this.generateToRequest(messages)

        const response = await handler.handle(request, async () => {
          if (!originalGenerate) throw new Error('generate not available')
          const raw = await originalGenerate(messages)
          return this.fromGenerateResult(raw)
        })

        return this.toGenerateResult(response)
      }
    }

    return client
  }

  extractResult(response: unknown): AgentResult {
    const res = response as LangChainMessage

    return {
      content: res.content ?? '',
      toolCalls: this.extractToolCalls(res),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      duration: 0,
      model: res.name ?? 'unknown',
      finishReason: 'stop',
      steps: [],
      raw: res,
    }
  }

  private invokeToRequest(input: unknown): LLMRequest {
    let messages: LLMRequest['messages'] = []

    if (typeof input === 'string') {
      messages = [{ role: 'user', content: input }]
    } else if (Array.isArray(input)) {
      messages = (input as LangChainMessage[]).map((m) => ({
        role: this.mapRole(m._getType?.()),
        content: m.content ?? '',
      }))
    } else if (input && typeof input === 'object' && 'content' in input) {
      messages = [{ role: 'user', content: (input as { content: string }).content }]
    }

    return { messages, model: 'unknown' }
  }

  private generateToRequest(messages: unknown[]): LLMRequest {
    const flat: LLMRequest['messages'] = []

    if (Array.isArray(messages)) {
      for (const batch of messages) {
        if (Array.isArray(batch)) {
          for (const m of batch as LangChainMessage[]) {
            flat.push({
              role: this.mapRole(m._getType?.()),
              content: m.content ?? '',
            })
          }
        }
      }
    }

    return { messages: flat, model: 'unknown' }
  }

  private fromInvokeResult(message: LangChainMessage): LLMResponse {
    return {
      content: message.content,
      toolCalls: this.extractToolCalls(message),
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      model: message.name ?? 'unknown',
      finishReason: 'stop',
      raw: message,
    }
  }

  private fromGenerateResult(result: LangChainGenerateResult): LLMResponse {
    const first = result.generations?.[0]?.[0]
    const msg = first?.message
    return {
      content: first?.text ?? msg?.content ?? '',
      toolCalls: msg ? this.extractToolCalls(msg) : [],
      usage: {
        promptTokens: result.llmOutput?.tokenUsage?.promptTokens ?? 0,
        completionTokens: result.llmOutput?.tokenUsage?.completionTokens ?? 0,
        totalTokens: result.llmOutput?.tokenUsage?.totalTokens ?? 0,
      },
      model: msg?.name ?? 'unknown',
      finishReason: 'stop',
      raw: result,
    }
  }

  private toInvokeResult(response: LLMResponse): LangChainMessage {
    return {
      _getType: () => 'ai',
      content: response.content,
      name: response.model,
      tool_calls: (response.toolCalls ?? []).map((tc) => ({
        name: tc.name,
        args: tc.arguments,
        id: tc.id,
      })),
    }
  }

  private toGenerateResult(response: LLMResponse): LangChainGenerateResult {
    return {
      generations: [[{
        text: response.content,
        message: this.toInvokeResult(response),
      }]],
      llmOutput: {
        tokenUsage: {
          promptTokens: response.usage.promptTokens,
          completionTokens: response.usage.completionTokens,
          totalTokens: response.usage.totalTokens,
        },
      },
    }
  }

  private extractToolCalls(message: LangChainMessage): ToolCall[] {
    return (message.tool_calls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.args,
    }))
  }

  private mapRole(type: string): 'user' | 'assistant' | 'system' | 'tool' {
    switch (type) {
      case 'human': return 'user'
      case 'ai': return 'assistant'
      case 'system': return 'system'
      default: return 'user'
    }
  }
}

/** Convenience function to wrap a LangChain model */
export function wrapLangChain(model: LangChainModel, handler: RequestHandler): LangChainModel {
  return new LangChainAdapter().wrapClient(model, handler)
}
