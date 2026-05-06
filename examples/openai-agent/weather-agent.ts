/**
 * Example: Weather Agent using OpenAI SDK
 *
 * This demonstrates how to test an AI agent that uses OpenAI's API
 * with tool calling to answer weather questions.
 */

import OpenAI from 'openai'
import { wrapOpenAI } from '../../src/adapters/openai.js'
import type { AgentBasaltEngine } from '../../src/core/engine.js'

interface WeatherResult {
  content: string
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>
}

export function createWeatherAgent(engine: AgentBasaltEngine) {
  const client = new OpenAI()
  const interceptor = engine.createInterceptor()
  const wrappedClient = wrapOpenAI(client, interceptor)

  return {
    async run(query: string): Promise<WeatherResult> {
      const response = await wrappedClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a weather assistant. Use the get_weather tool to answer weather questions.'
          },
          { role: 'user', content: query }
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'get_weather',
            description: 'Get current weather for a city',
            parameters: {
              type: 'object',
              properties: {
                city: { type: 'string', description: 'City name' }
              },
              required: ['city']
            }
          }
        }]
      })

      const message = response.choices[0]?.message
      return {
        content: message?.content ?? '',
        toolCalls: (message?.tool_calls ?? []).map((tc: any) => ({
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments)
        }))
      }
    }
  }
}
