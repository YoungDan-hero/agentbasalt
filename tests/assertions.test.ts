import { describe, it, expect as vitestExpect } from 'vitest'
import { expect, AgentExpect, TraceExpect, AssertionError } from '../src/core/assertions.js'
import { trace } from '../src/core/trace.js'
import type { AgentResult, CostTracker } from '../src/core/types.js'

function makeResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    content: 'test response',
    toolCalls: [],
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    duration: 100,
    model: 'gpt-4o',
    finishReason: 'stop',
    steps: [],
    raw: null,
    ...overrides,
  }
}

describe('expect() — factory', () => {
  it('returns AgentExpect for AgentResult', () => {
    const e = expect(makeResult())
    vitestExpect(e).toBeInstanceOf(AgentExpect)
  })

  it('returns TraceExpect for AgentTrace', () => {
    const t = trace()
    const e = expect(t)
    vitestExpect(e).toBeInstanceOf(TraceExpect)
  })
})

describe('AgentExpect', () => {
  describe('tool call assertions', () => {
    it('toHaveCalledTool passes when tool found', () => {
      const result = makeResult({
        toolCalls: [{ id: 'c1', name: 'search', arguments: { query: 'test' } }],
      })
      vitestExpect(() => expect(result).toHaveCalledTool('search')).not.toThrow()
    })

    it('toHaveCalledTool fails when tool not found', () => {
      const result = makeResult({ toolCalls: [] })
      vitestExpect(() => expect(result).toHaveCalledTool('search')).toThrow(AssertionError)
    })

    it('toHaveCalledTool checks arguments', () => {
      const result = makeResult({
        toolCalls: [{ id: 'c1', name: 'search', arguments: { query: 'test' } }],
      })
      vitestExpect(() =>
        expect(result).toHaveCalledTool('search', { query: 'test' }),
      ).not.toThrow()

      vitestExpect(() =>
        expect(result).toHaveCalledTool('search', { query: 'other' }),
      ).toThrow(AssertionError)
    })

    it('toHaveNotCalledTool passes when tool absent', () => {
      const result = makeResult({ toolCalls: [] })
      vitestExpect(() => expect(result).toHaveNotCalledTool('delete')).not.toThrow()
    })

    it('toHaveToolCallCount checks count', () => {
      const result = makeResult({
        toolCalls: [
          { id: 'c1', name: 'a', arguments: {} },
          { id: 'c2', name: 'b', arguments: {} },
        ],
      })
      vitestExpect(() => expect(result).toHaveToolCallCount(2)).not.toThrow()
      vitestExpect(() => expect(result).toHaveToolCallCount(3)).toThrow(AssertionError)
    })
  })

  describe('response assertions', () => {
    it('toHaveRespondedContaining checks substring', () => {
      const result = makeResult({ content: 'Tokyo is 25°C' })
      vitestExpect(() => expect(result).toHaveRespondedContaining('Tokyo')).not.toThrow()
      vitestExpect(() => expect(result).toHaveRespondedContaining('Paris')).toThrow(AssertionError)
    })

    it('toHaveRespondedContaining is case-insensitive', () => {
      const result = makeResult({ content: 'TOKYO is hot' })
      vitestExpect(() => expect(result).toHaveRespondedContaining('tokyo')).not.toThrow()
    })

    it('toHaveRespondedMatching checks regex', () => {
      const result = makeResult({ content: 'Temperature: 25°C' })
      vitestExpect(() => expect(result).toHaveRespondedMatching(/\d+°/)).not.toThrow()
      vitestExpect(() => expect(result).toHaveRespondedMatching(/rain/)).toThrow(AssertionError)
    })

    it('toHaveRespondedWith checks exact string', () => {
      const result = makeResult({ content: 'spam' })
      vitestExpect(() => expect(result).toHaveRespondedWith('spam')).not.toThrow()
      vitestExpect(() => expect(result).toHaveRespondedWith('not spam')).toThrow(AssertionError)
    })

    it('toHaveEmptyResponse checks empty content', () => {
      vitestExpect(() => expect(makeResult({ content: '' })).toHaveEmptyResponse()).not.toThrow()
      vitestExpect(() => expect(makeResult({ content: '  ' })).toHaveEmptyResponse()).not.toThrow()
      vitestExpect(() => expect(makeResult({ content: 'not empty' })).toHaveEmptyResponse()).toThrow()
    })
  })

  describe('token/cost assertions', () => {
    it('toHaveUsedTokensLessThan', () => {
      const result = makeResult({ usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } })
      vitestExpect(() => expect(result).toHaveUsedTokensLessThan(20)).not.toThrow()
      vitestExpect(() => expect(result).toHaveUsedTokensLessThan(10)).toThrow(AssertionError)
    })

    it('toHaveUsedTokensMoreThan', () => {
      const result = makeResult({ usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } })
      vitestExpect(() => expect(result).toHaveUsedTokensMoreThan(10)).not.toThrow()
      vitestExpect(() => expect(result).toHaveUsedTokensMoreThan(20)).toThrow(AssertionError)
    })
  })

  describe('performance assertions', () => {
    it('toHaveCompletedWithin', () => {
      vitestExpect(() => expect(makeResult({ duration: 100 })).toHaveCompletedWithin(200)).not.toThrow()
      vitestExpect(() => expect(makeResult({ duration: 300 })).toHaveCompletedWithin(200)).toThrow()
    })
  })

  describe('model assertions', () => {
    it('toHaveUsedModel', () => {
      vitestExpect(() => expect(makeResult({ model: 'gpt-4o' })).toHaveUsedModel('gpt-4o')).not.toThrow()
      vitestExpect(() => expect(makeResult({ model: 'gpt-4o' })).toHaveUsedModel('claude')).toThrow()
    })
  })

  describe('finish reason', () => {
    it('toHaveFinishReason', () => {
      vitestExpect(() => expect(makeResult({ finishReason: 'stop' })).toHaveFinishReason('stop')).not.toThrow()
      vitestExpect(() => expect(makeResult({ finishReason: 'stop' })).toHaveFinishReason('tool_calls')).toThrow()
    })
  })

  describe('not modifier', () => {
    it('inverts assertion', () => {
      const result = makeResult({ content: 'hello' })
      vitestExpect(() => expect(result).not.toHaveRespondedContaining('world')).not.toThrow()
      vitestExpect(() => expect(result).not.toHaveRespondedContaining('hello')).toThrow()
    })
  })
})

describe('TraceExpect', () => {
  it('toHaveStepCount', async () => {
    const t = trace()
    await t.run(async () => {
      await t.step('a', 'llm', async () => 'x')
      await t.step('b', 'tool', async () => 'y')
    })

    vitestExpect(() => expect(t).toHaveStepCount(2)).not.toThrow()
    vitestExpect(() => expect(t).toHaveStepCount(3)).toThrow(AssertionError)
  })

  it('toHaveStepSequence', async () => {
    const t = trace()
    await t.run(async () => {
      await t.step('plan', 'llm', async () => 'x')
      await t.step('search', 'tool', async () => 'y')
      await t.step('answer', 'llm', async () => 'z')
    })

    vitestExpect(() => expect(t).toHaveStepSequence(['plan', 'search', 'answer'])).not.toThrow()
    vitestExpect(() => expect(t).toHaveStepSequence(['search', 'plan', 'answer'])).toThrow()
  })

  it('toHaveStep with type', async () => {
    const t = trace()
    await t.run(async () => {
      await t.step('llm-step', 'llm', async () => 'x')
      await t.step('tool-step', 'tool', async () => 'y')
    })

    vitestExpect(() => expect(t).toHaveStep('llm-step', { type: 'llm' })).not.toThrow()
    vitestExpect(() => expect(t).toHaveStep('llm-step', { type: 'tool' })).toThrow()
    vitestExpect(() => expect(t).toHaveStep('nonexistent')).toThrow()
  })

  it('toHaveLLMCallCount and toHaveToolCallCount', async () => {
    const t = trace()
    await t.run(async () => {
      await t.step('llm1', 'llm', async () => 'x')
      await t.step('tool1', 'tool', async () => 'y')
      await t.step('llm2', 'llm', async () => 'z')
    })

    vitestExpect(() => expect(t).toHaveLLMCallCount(2)).not.toThrow()
    vitestExpect(() => expect(t).toHaveToolCallCount(1)).not.toThrow()
    vitestExpect(() => expect(t).toHaveLLMCallCount(3)).toThrow()
  })

  it('toHaveNoErrors passes when no errors', async () => {
    const t = trace()
    await t.run(async () => {
      await t.step('ok', 'llm', async () => 'fine')
    })

    vitestExpect(() => expect(t).toHaveNoErrors()).not.toThrow()
  })

  it('toHaveNoErrors fails on error step', async () => {
    const t = trace()
    await vitestExpect(
      t.run(async () => {
        await t.step('bad', 'llm', async () => { throw new Error('fail') })
      }),
    ).rejects.toThrow()

    vitestExpect(() => expect(t).toHaveNoErrors()).toThrow(AssertionError)
  })

  it('toHaveTotalDurationLessThan', async () => {
    const t = trace()
    await t.run(async () => {
      await t.step('fast', 'llm', async () => 'x')
    })

    vitestExpect(() => expect(t).toHaveTotalDurationLessThan(5000)).not.toThrow()
    vitestExpect(() => expect(t).toHaveTotalDurationLessThan(0)).toThrow()
  })
})
