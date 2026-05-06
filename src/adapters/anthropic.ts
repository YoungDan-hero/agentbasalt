import { BaseAdapter } from './base.js'
import type {
  RequestHandler,
  AgentResult,
  LLMRequest,
  LLMResponse,
  ToolCall,
  Usage,
} from '../core/types.js'

// ─── Anthropic SDK Types (minimal) ──────────────────────────────────

interface AnthropicMessage {
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string | unknown[] }

interface AnthropicTool {
  name: string
  description?: string
  input_schema: Record<string, unknown>
}

interface AnthropicCreateParams {
  model: string
  max_tokens: number
  messages: AnthropicMessage[]
  system?: string
  tools?: AnthropicTool[]
  temperature?: number
  [key: string]: unknown
}

interface AnthropicResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: AnthropicContentBlock[]
  model: string
  stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | null
  usage: {
    input_tokens: number
    output_tokens: number
  }
}

interface AnthropicClient {
  messages: {
    create(params: AnthropicCreateParams): Promise<AnthropicResponse>
  }
}

// ─── Adapter ────────────────────────────────────────────────────────

/**
 * Adapter for the Anthropic SDK.
 *
 * Usage:
 * ```ts
 * import { wrapAnthropic } from 'agentbasalt/adapters/anthropic'
 * import Anthropic from '@anthropic-ai/sdk'
 *
 * const client = new Anthropic()
 * const wrapped = wrapAnthropic(client, handler)
 * ```
 */
export class AnthropicAdapter extends BaseAdapter {
  name = 'anthropic'
  provider = 'anthropic'

  wrapClient(client: AnthropicClient, handler: RequestHandler): AnthropicClient {
    const originalCreate = client.messages.create.bind(client.messages)

    client.messages.create = async (params: AnthropicCreateParams): Promise<AnthropicResponse> => {
      const request = this.toRequest(params)

      const response = await handler.handle(request, async () => {
        const raw = await originalCreate(params)
        return this.fromResponse(raw)
      })

      return this.toAnthropicResponse(response)
    }

    return client
  }

  extractResult(response: unknown): AgentResult {
    const res = response as AnthropicResponse

    return {
      content: this.extractTextContent(res),
      toolCalls: this.extractToolCalls(res),
      usage: this.extractUsage(res),
      duration: 0,
      model: res.model ?? 'unknown',
      finishReason: res.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      steps: [],
      raw: res,
    }
  }

  /** Convert Anthropic SDK params → our LLMRequest */
  toRequest(params: AnthropicCreateParams): LLMRequest {
    const messages: LLMRequest['messages'] = []

    // Add system message if present
    if (params.system) {
      messages.push({ role: 'system', content: params.system })
    }

    for (const msg of params.messages) {
      if (typeof msg.content === 'string') {
        messages.push({ role: msg.role, content: msg.content })
      } else {
        const textParts: string[] = []
        const toolCalls: ToolCall[] = []
        let toolCallId: string | undefined

        for (const block of msg.content) {
          if (block.type === 'text') {
            textParts.push(block.text)
          } else if (block.type === 'tool_use') {
            toolCalls.push({
              id: block.id,
              name: block.name,
              arguments: block.input,
            })
          } else if (block.type === 'tool_result') {
            toolCallId = block.tool_use_id
            const resultContent = typeof block.content === 'string'
              ? block.content
              : JSON.stringify(block.content)
            textParts.push(resultContent)
          }
        }

        messages.push({
          role: msg.role,
          content: textParts.join('\n'),
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          toolCallId,
        })
      }
    }

    return {
      messages,
      model: params.model,
      tools: params.tools?.map((t) => ({
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema,
      })),
      maxTokens: params.max_tokens,
    }
  }

  /** Convert Anthropic SDK response → our LLMResponse */
  fromResponse(res: AnthropicResponse): LLMResponse {
    return {
      content: this.extractTextContent(res),
      toolCalls: this.extractToolCalls(res),
      usage: this.extractUsage(res),
      model: res.model,
      finishReason: res.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
      raw: res,
    }
  }

  /** Convert our LLMResponse → Anthropic SDK response format */
  toAnthropicResponse(response: LLMResponse): AnthropicResponse {
    const content: AnthropicContentBlock[] = []

    if (response.content) {
      content.push({ type: 'text', text: response.content })
    }

    for (const tc of response.toolCalls ?? []) {
      content.push({
        type: 'tool_use',
        id: tc.id,
        name: tc.name,
        input: tc.arguments,
      })
    }

    return {
      id: `msg-agentbasalt-${Date.now()}`,
      type: 'message',
      role: 'assistant',
      content,
      model: response.model,
      stop_reason: response.finishReason === 'tool_calls' ? 'tool_use' : 'end_turn',
      usage: {
        input_tokens: response.usage.promptTokens,
        output_tokens: response.usage.completionTokens,
      },
    }
  }

  private extractTextContent(res: AnthropicResponse): string {
    return res.content
      .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
  }

  private extractToolCalls(res: AnthropicResponse): ToolCall[] {
    return res.content
      .filter((b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } => b.type === 'tool_use')
      .map((b) => ({
        id: b.id,
        name: b.name,
        arguments: b.input,
      }))
  }

  private extractUsage(res: AnthropicResponse): Usage {
    return {
      promptTokens: res.usage?.input_tokens ?? 0,
      completionTokens: res.usage?.output_tokens ?? 0,
      totalTokens: (res.usage?.input_tokens ?? 0) + (res.usage?.output_tokens ?? 0),
    }
  }
}

/** Convenience function to wrap an Anthropic client */
export function wrapAnthropic(client: AnthropicClient, handler: RequestHandler): AnthropicClient {
  return new AnthropicAdapter().wrapClient(client, handler)
}
