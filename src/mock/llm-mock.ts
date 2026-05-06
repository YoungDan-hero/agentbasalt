import type { LLMRequest, LLMResponse, RequestHandler, MockResponseEntry, MatchStrategy } from '../core/types.js'
import { Matcher } from './matcher.js'

/**
 * Create a RequestHandler that returns mock responses based on request matching.
 */
export function createMockHandler(
  responses: MockResponseEntry[],
  matchStrategy: MatchStrategy = 'contains',
): RequestHandler {
  const matcher = new Matcher(matchStrategy)

  return {
    handle: async (request: LLMRequest, _originalCall: () => Promise<LLMResponse>): Promise<LLMResponse> => {
      const entry = responses.find((r) => matcher.match(request, r.match))

      if (!entry) {
        const lastMsg = request.messages
          .filter((m) => m.role === 'user')
          .pop()?.content ?? '(empty)'

        throw new Error(
          `No mock response matched request.\n` +
          `Last user message: "${lastMsg.slice(0, 200)}"\n` +
          `Available mocks: ${responses.length}\n\n` +
          `Tip: Add a mock response using agentBasalt({ mode: 'mock', mockResponses: [...] })`
        )
      }

      return {
        content: entry.response.content ?? '',
        toolCalls: entry.response.toolCalls ?? [],
        usage: entry.response.usage ?? {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        model: entry.response.model ?? request.model,
        finishReason: entry.response.finishReason ?? 'stop',
        raw: entry.response.raw ?? null,
      }
    },
  }
}

/** @deprecated Use createMockHandler instead */
export const createMockInterceptor = createMockHandler

/**
 * Helper to create a simple text mock response
 */
export function mockText(
  match: string,
  response: string,
  options?: { model?: string; tokens?: number },
): MockResponseEntry {
  return {
    match: { contains: match },
    response: {
      content: response,
      model: options?.model,
      usage: options?.tokens
        ? {
            promptTokens: Math.floor(options.tokens * 0.3),
            completionTokens: Math.floor(options.tokens * 0.7),
            totalTokens: options.tokens,
          }
        : undefined,
    },
  }
}

/**
 * Helper to create a mock response with tool calls
 */
export function mockToolCall(
  match: string,
  toolCalls: Array<{ id: string; name: string; arguments: Record<string, unknown> }>,
  finalContent?: string,
): MockResponseEntry {
  return {
    match: { contains: match },
    response: {
      content: finalContent ?? '',
      toolCalls,
      finishReason: 'tool_calls',
    },
  }
}
