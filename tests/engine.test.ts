import { describe, it, expect as vitestExpect } from 'vitest'
import { agentBasalt, clearEngineRegistry } from '../src/core/engine.js'
import type { LLMRequest, LLMResponse } from '../src/core/types.js'

function makeRequest(content: string): LLMRequest {
  return {
    messages: [{ role: 'user', content }],
    model: 'gpt-4o',
  }
}

describe('AgentBasaltEngine', () => {
  describe('mock mode', () => {
    it('returns matching mock response', async () => {
      const engine = agentBasalt({
        mode: 'mock',
        mockResponses: [
          {
            match: { contains: 'weather' },
            response: { content: 'sunny', model: 'gpt-4o' },
          },
        ],
      })

      const handler = engine.createHandler()
      const response = await handler.handle(
        makeRequest('what is the weather'),
        async () => { throw new Error('should not call') },
      )

      vitestExpect(response.content).toBe('sunny')
      vitestExpect(response.model).toBe('gpt-4o')
    })

    it('throws when no mock matches', async () => {
      const engine = agentBasalt({
        mode: 'mock',
        mockResponses: [],
      })

      const handler = engine.createHandler()
      await vitestExpect(
        handler.handle(makeRequest('no match'), async () => { throw new Error('no') }),
      ).rejects.toThrow('No mock response found')
    })

    it('matches by exact content', async () => {
      const engine = agentBasalt({
        mode: 'mock',
        mockResponses: [
          { match: { exact: 'ping' }, response: { content: 'pong' } },
        ],
      })

      const handler = engine.createHandler()
      const res = await handler.handle(makeRequest('ping'), async () => { throw new Error('no') })
      vitestExpect(res.content).toBe('pong')
    })

    it('matches by regex pattern', async () => {
      const engine = agentBasalt({
        mode: 'mock',
        mockResponses: [
          { match: { pattern: 'weather.*tokyo' }, response: { content: '25°C' } },
        ],
      })

      const handler = engine.createHandler()
      const res = await handler.handle(
        makeRequest('what is the weather in tokyo'),
        async () => { throw new Error('no') },
      )
      vitestExpect(res.content).toBe('25°C')
    })

    it('returns tool calls from mock', async () => {
      const engine = agentBasalt({
        mode: 'mock',
        mockResponses: [
          {
            match: { contains: 'search' },
            response: {
              content: '',
              toolCalls: [{ id: 'c1', name: 'web_search', arguments: { query: 'test' } }],
              finishReason: 'tool_calls',
            },
          },
        ],
      })

      const handler = engine.createHandler()
      const res = await handler.handle(
        makeRequest('search for test'),
        async () => { throw new Error('no') },
      )
      vitestExpect(res.toolCalls).toHaveLength(1)
      vitestExpect(res.toolCalls![0].name).toBe('web_search')
      vitestExpect(res.finishReason).toBe('tool_calls')
    })
  })

  describe('createHandler', () => {
    it('returns a handler with handle method', () => {
      const engine = agentBasalt({ mode: 'mock', mockResponses: [] })
      const handler = engine.createHandler()
      vitestExpect(typeof handler.handle).toBe('function')
    })
  })

  describe('createInterceptor (deprecated)', () => {
    it('still works for backward compat', async () => {
      const engine = agentBasalt({
        mode: 'mock',
        mockResponses: [
          { match: { contains: 'hi' }, response: { content: 'hello' } },
        ],
      })

      const interceptor = engine.createInterceptor()
      vitestExpect(typeof interceptor.onRequest).toBe('function')

      const res = await interceptor.onRequest(makeRequest('hi'))
      vitestExpect(res.content).toBe('hello')
    })
  })

  describe('passthrough mode', () => {
    it('calls original and returns its response', async () => {
      const engine = agentBasalt({ mode: 'passthrough' })
      const handler = engine.createHandler()

      const mockResponse: LLMResponse = {
        content: 'real response',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
        raw: null,
      }

      const res = await handler.handle(makeRequest('test'), async () => mockResponse)
      vitestExpect(res.content).toBe('real response')
    })
  })

  describe('getMode', () => {
    it('returns the current mode', () => {
      vitestExpect(agentBasalt({ mode: 'mock' }).getMode()).toBe('mock')
      vitestExpect(agentBasalt({ mode: 'replay' }).getMode()).toBe('replay')
      vitestExpect(agentBasalt({ mode: 'record' }).getMode()).toBe('record')
      vitestExpect(agentBasalt({ mode: 'passthrough' }).getMode()).toBe('passthrough')
    })
  })

  describe('engine registry', () => {
    it('clearEngineRegistry clears tracked engines', () => {
      clearEngineRegistry()
      // Creating engines in record mode should track them
      agentBasalt({ mode: 'record' })
      clearEngineRegistry()
      // No error = success
    })
  })
})
