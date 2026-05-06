/**
 * Example test: Weather Agent
 *
 * Run: npx agentbasalt test examples/
 */

import { test, expect, agentBasalt } from '../../src/index.js'
import { createWeatherAgent } from './weather-agent.js'

test('weather agent calls get_weather tool for Tokyo', async () => {
  const engine = agentBasalt({
    mode: 'mock',
    mockResponses: [
      {
        match: { contains: 'Tokyo' },
        response: {
          content: '',
          toolCalls: [{
            id: 'call_1',
            name: 'get_weather',
            arguments: { city: 'Tokyo' }
          }],
          finishReason: 'tool_calls',
          usage: { promptTokens: 50, completionTokens: 20, totalTokens: 70 }
        }
      }
    ]
  })

  const agent = createWeatherAgent(engine)
  const result = await agent.run('What is the weather in Tokyo?')

  expect(result).toHaveCalledTool('get_weather', { city: 'Tokyo' })
  expect(result).toHaveToolCallCount(1)
})

test('weather agent responds directly for greetings', async () => {
  const engine = agentBasalt({
    mode: 'mock',
    mockResponses: [
      {
        match: { contains: 'hello' },
        response: {
          content: 'Hello! I can help you with weather information. What city would you like to know about?',
          toolCalls: [],
          finishReason: 'stop',
          usage: { promptTokens: 30, completionTokens: 25, totalTokens: 55 }
        }
      }
    ]
  })

  const agent = createWeatherAgent(engine)
  const result = await agent.run('hello')

  expect(result).toHaveRespondedContaining('weather')
  expect(result).toHaveToolCallCount(0)
  expect(result).toHaveFinishReason('stop')
})
