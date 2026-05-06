import { describe, it, expect } from 'vitest'
import { OpenAIAdapter } from '../src/adapters/openai.js'
import type { LLMRequest, LLMResponse, RequestHandler } from '../src/core/types.js'

const adapter = new OpenAIAdapter()

describe('OpenAIAdapter', () => {
  describe('toRequest()', () => {
    it('converts basic params', () => {
      const request = adapter.toRequest({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are helpful' },
          { role: 'user', content: 'Hello' },
        ],
      })

      expect(request.model).toBe('gpt-4o')
      expect(request.messages).toHaveLength(2)
      expect(request.messages[0]).toEqual({ role: 'system', content: 'You are helpful' })
      expect(request.messages[1]).toEqual({ role: 'user', content: 'Hello' })
    })

    it('converts tools', () => {
      const request = adapter.toRequest({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test' }],
        tools: [{
          type: 'function',
          function: {
            name: 'search',
            description: 'Search the web',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
        }],
      })

      expect(request.tools).toHaveLength(1)
      expect(request.tools![0].name).toBe('search')
      expect(request.tools![0].description).toBe('Search the web')
    })

    it('converts tool_calls in assistant message', () => {
      const request = adapter.toRequest({
        model: 'gpt-4o',
        messages: [{
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_1',
            type: 'function',
            function: { name: 'search', arguments: '{"query":"test"}' },
          }],
        }],
      })

      expect(request.messages[0].toolCalls).toHaveLength(1)
      expect(request.messages[0].toolCalls![0].name).toBe('search')
      expect(request.messages[0].toolCalls![0].arguments).toEqual({ query: 'test' })
    })

    it('converts tool role message', () => {
      const request = adapter.toRequest({
        model: 'gpt-4o',
        messages: [{
          role: 'tool',
          content: 'search results here',
          tool_call_id: 'call_1',
        }],
      })

      expect(request.messages[0].role).toBe('tool')
      expect(request.messages[0].toolCallId).toBe('call_1')
    })

    it('converts temperature and max_tokens', () => {
      const request = adapter.toRequest({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.7,
        max_tokens: 1000,
      })

      expect(request.temperature).toBe(0.7)
      expect(request.maxTokens).toBe(1000)
    })
  })

  describe('fromResponse()', () => {
    it('converts basic response', () => {
      const response = adapter.fromResponse({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello!' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })

      expect(response.content).toBe('Hello!')
      expect(response.model).toBe('gpt-4o')
      expect(response.finishReason).toBe('stop')
      expect(response.usage.totalTokens).toBe(15)
    })

    it('converts tool_calls response', () => {
      const response = adapter.fromResponse({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [{
              id: 'call_1',
              type: 'function',
              function: { name: 'search', arguments: '{"query":"weather"}' },
            }],
          },
          finish_reason: 'tool_calls',
        }],
      })

      expect(response.content).toBe('')
      expect(response.toolCalls).toHaveLength(1)
      expect(response.toolCalls![0].name).toBe('search')
      expect(response.finishReason).toBe('tool_calls')
    })

    it('handles missing usage', () => {
      const response = adapter.fromResponse({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'hi' },
          finish_reason: 'stop',
        }],
      })

      expect(response.usage.totalTokens).toBe(0)
    })
  })

  describe('toOpenAIResponse()', () => {
    it('converts LLMResponse back to OpenAI format', () => {
      const llmResponse: LLMResponse = {
        content: 'Hello!',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
        raw: null,
      }

      const openaiResponse = adapter.toOpenAIResponse(llmResponse)

      expect(openaiResponse.choices[0].message.content).toBe('Hello!')
      expect(openaiResponse.choices[0].finish_reason).toBe('stop')
      expect(openaiResponse.usage!.total_tokens).toBe(15)
      expect(openaiResponse.model).toBe('gpt-4o')
    })

    it('converts tool calls back to OpenAI format', () => {
      const llmResponse: LLMResponse = {
        content: '',
        toolCalls: [{ id: 'c1', name: 'search', arguments: { query: 'test' } }],
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'tool_calls',
        raw: null,
      }

      const openaiResponse = adapter.toOpenAIResponse(llmResponse)

      expect(openaiResponse.choices[0].message.tool_calls).toHaveLength(1)
      expect(openaiResponse.choices[0].message.tool_calls![0].function.name).toBe('search')
      expect(openaiResponse.choices[0].message.tool_calls![0].function.arguments).toBe('{"query":"test"}')
      expect(openaiResponse.choices[0].finish_reason).toBe('tool_calls')
    })
  })

  describe('wrapClient()', () => {
    it('wraps chat.completions.create with handler', async () => {
      const mockResponse: LLMResponse = {
        content: 'mocked!',
        usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
        model: 'gpt-4o',
        finishReason: 'stop',
        raw: null,
      }

      const handler: RequestHandler = {
        handle: async () => mockResponse,
      }

      const fakeClient = {
        chat: {
          completions: {
            create: async () => { throw new Error('should not be called') },
          },
        },
      }

      const wrapped = adapter.wrapClient(fakeClient, handler)
      const result = await wrapped.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'test' }],
      })

      expect(result.choices[0].message.content).toBe('mocked!')
    })
  })

  describe('extractResult()', () => {
    it('extracts AgentResult from OpenAI response', () => {
      const result = adapter.extractResult({
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        model: 'gpt-4o',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: 'Hello' },
          finish_reason: 'stop',
        }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      })

      expect(result.content).toBe('Hello')
      expect(result.model).toBe('gpt-4o')
      expect(result.finishReason).toBe('stop')
      expect(result.usage.totalTokens).toBe(15)
    })
  })
})
