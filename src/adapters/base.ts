import type { AgentAdapter, RequestHandler, AgentResult, LLMResponse } from '../core/types.js'

/**
 * Base adapter class that all provider adapters should extend.
 */
export abstract class BaseAdapter implements AgentAdapter {
  abstract name: string
  abstract provider: string

  abstract wrapClient(client: unknown, handler: RequestHandler): unknown
  abstract extractResult(response: unknown): AgentResult

  /** Helper: create a normalized AgentResult from an LLMResponse */
  protected createResult(response: LLMResponse, duration: number): AgentResult {
    return {
      content: response.content,
      toolCalls: response.toolCalls ?? [],
      usage: response.usage,
      duration,
      model: response.model,
      finishReason: response.finishReason,
      steps: [],
      raw: response.raw,
    }
  }
}
