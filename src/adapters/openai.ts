import { BaseAdapter } from './base.js'
import type {
  RequestHandler,
  AgentResult,
  LLMRequest,
  LLMResponse,
  ToolCall,
  Usage,
} from '../core/types.js'

// ─── OpenAI SDK Types (minimal, avoids importing the full SDK) ──────

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_call_id?: string
  tool_calls?: OpenAIToolCall[]
}

interface OpenAIToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

interface OpenAITool {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>
  }
}

interface OpenAIChatParams {
  model: string
  messages: OpenAIMessage[]
  tools?: OpenAITool[]
  temperature?: number
  max_tokens?: number
  [key: string]: unknown
}

interface OpenAIChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: Array<{
    index: number
    message: {
      role: 'assistant'
      content: string | null
      tool_calls?: OpenAIToolCall[]
    }
    finish_reason: string
  }>
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

interface OpenAIClient {
  chat: {
    completions: {
      create(params: OpenAIChatParams): Promise<OpenAIChatResponse>
    }
  }
}

// ─── Adapter ────────────────────────────────────────────────────────

/**
 * Adapter for the OpenAI SDK.
 *
 * Usage:
 * ```ts
 * import { wrapOpenAI } from 'agentbasalt/adapters/openai'
 * import OpenAI from 'openai'
 *
 * const client = new OpenAI()
 * const wrapped = wrapOpenAI(client, handler)
 * ```
 */
export class OpenAIAdapter extends BaseAdapter {
  name = 'openai'
  provider = 'openai'

  wrapClient(client: OpenAIClient, handler: RequestHandler): OpenAIClient {
    const originalCreate = client.chat.completions.create.bind(client.chat.completions)

    client.chat.completions.create = async (params: OpenAIChatParams): Promise<OpenAIChatResponse> => {
      const request = this.toRequest(params)

      const response = await handler.handle(request, async () => {
        const raw = await originalCreate(params)
        return this.fromResponse(raw)
      })

      return this.toOpenAIResponse(response)
    }

    return client
  }

  extractResult(response: unknown): AgentResult {
    const res = response as OpenAIChatResponse
    const duration = (res as OpenAIChatResponse & { _agentBasaltDuration?: number })._agentBasaltDuration ?? 0

    return {
      content: res.choices?.[0]?.message?.content ?? '',
      toolCalls: this.extractToolCalls(res),
      usage: this.extractUsage(res),
      duration,
      model: res.model ?? 'unknown',
      finishReason: res.choices?.[0]?.finish_reason ?? 'stop',
      steps: [],
      raw: res,
    }
  }

  /** Convert OpenAI SDK params → our LLMRequest */
  toRequest(params: OpenAIChatParams): LLMRequest {
    return {
      messages: params.messages.map((m) => ({
        role: m.role,
        content: m.content ?? '',
        toolCallId: m.tool_call_id,
        toolCalls: m.tool_calls?.map((tc) => ({
          id: tc.id,
          name: tc.function.name,
          arguments: this.safeParseJSON(tc.function.arguments),
        })),
      })),
      model: params.model,
      tools: params.tools?.map((t) => ({
        name: t.function.name,
        description: t.function.description ?? '',
        parameters: t.function.parameters ?? {},
      })),
      temperature: params.temperature,
      maxTokens: params.max_tokens,
    }
  }

  /** Convert OpenAI SDK response → our LLMResponse */
  fromResponse(res: OpenAIChatResponse): LLMResponse {
    return {
      content: res.choices?.[0]?.message?.content ?? '',
      toolCalls: this.extractToolCalls(res),
      usage: this.extractUsage(res),
      model: res.model,
      finishReason: this.mapFinishReason(res.choices?.[0]?.finish_reason),
      raw: res,
    }
  }

  /** Convert our LLMResponse → OpenAI SDK response format */
  toOpenAIResponse(response: LLMResponse): OpenAIChatResponse {
    const message: OpenAIChatResponse['choices'][0]['message'] = {
      role: 'assistant',
      content: response.content || null,
    }

    if (response.toolCalls && response.toolCalls.length > 0) {
      message.tool_calls = response.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }))
    }

    return {
      id: `chatcmpl-agentbasalt-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: response.model,
      choices: [{
        index: 0,
        message,
        finish_reason: response.finishReason === 'tool_calls' ? 'tool_calls' : 'stop',
      }],
      usage: {
        prompt_tokens: response.usage.promptTokens,
        completion_tokens: response.usage.completionTokens,
        total_tokens: response.usage.totalTokens,
      },
    }
  }

  private extractToolCalls(res: OpenAIChatResponse): ToolCall[] {
    const calls = res.choices?.[0]?.message?.tool_calls ?? []
    return calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: this.safeParseJSON(tc.function.arguments),
    }))
  }

  private extractUsage(res: OpenAIChatResponse): Usage {
    return {
      promptTokens: res.usage?.prompt_tokens ?? 0,
      completionTokens: res.usage?.completion_tokens ?? 0,
      totalTokens: res.usage?.total_tokens ?? 0,
    }
  }

  private mapFinishReason(reason: string | undefined): LLMResponse['finishReason'] {
    switch (reason) {
      case 'tool_calls': return 'tool_calls'
      case 'length': return 'length'
      case 'content_filter': return 'content_filter'
      default: return 'stop'
    }
  }

  private safeParseJSON(str: string): Record<string, unknown> {
    try {
      return JSON.parse(str)
    } catch {
      return {}
    }
  }
}

/** Convenience function to wrap an OpenAI client */
export function wrapOpenAI(client: OpenAIClient, handler: RequestHandler): OpenAIClient {
  return new OpenAIAdapter().wrapClient(client, handler)
}
