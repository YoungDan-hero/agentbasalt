import { describe, it, expect as vitestExpect } from 'vitest'
import { trace, AgentTrace } from '../src/core/trace.js'

describe('AgentTrace', () => {
  describe('basic step recording', () => {
    it('records steps in order', async () => {
      const t = trace()

      await t.run(async () => {
        await t.step('first', 'llm', async () => 'a')
        await t.step('second', 'tool', async () => 'b')
        await t.step('third', 'llm', async () => 'c')
      })

      vitestExpect(t.getSteps()).toHaveLength(3)
      vitestExpect(t.getStepNames()).toEqual(['first', 'second', 'third'])
    })

    it('records step types', async () => {
      const t = trace()

      await t.run(async () => {
        await t.step('llm-step', 'llm', async () => 'a')
        await t.step('tool-step', 'tool', async () => 'b')
        await t.step('custom-step', 'custom', async () => 'c')
      })

      vitestExpect(t.getStep('llm-step')?.type).toBe('llm')
      vitestExpect(t.getStep('tool-step')?.type).toBe('tool')
      vitestExpect(t.getStep('custom-step')?.type).toBe('custom')
    })

    it('records step output', async () => {
      const t = trace()

      await t.run(async () => {
        await t.step('calc', 'custom', async () => 42)
      })

      vitestExpect(t.getStep('calc')?.output).toBe(42)
    })

    it('records step duration', async () => {
      const t = trace()

      await t.run(async () => {
        await t.step('slow', 'custom', async () => {
          await new Promise((r) => setTimeout(r, 50))
          return 'done'
        })
      })

      const step = t.getStep('slow')
      vitestExpect(step).toBeDefined()
      vitestExpect(step!.duration).toBeGreaterThan(30)
      vitestExpect(step!.startTime).toBeGreaterThan(0)
      vitestExpect(step!.endTime).toBeGreaterThan(step!.startTime)
    })
  })

  describe('nested steps', () => {
    it('nests child steps under parent', async () => {
      const t = trace()

      await t.run(async () => {
        await t.step('parent', 'llm', async () => {
          await t.step('child1', 'tool', async () => 'a')
          await t.step('child2', 'tool', async () => 'b')
          return 'done'
        })
      })

      vitestExpect(t.getSteps()).toHaveLength(1)
      const parent = t.getSteps()[0]
      vitestExpect(parent.children).toHaveLength(2)
      vitestExpect(parent.children[0].name).toBe('child1')
      vitestExpect(parent.children[1].name).toBe('child2')
    })

    it('getStepsByType flattens nested steps', async () => {
      const t = trace()

      await t.run(async () => {
        await t.step('parent', 'llm', async () => {
          await t.step('child-tool', 'tool', async () => 'a')
          return 'done'
        })
      })

      vitestExpect(t.getStepsByType('tool')).toHaveLength(1)
      vitestExpect(t.getStepsByType('llm')).toHaveLength(1)
    })
  })

  describe('runError cleanup', () => {
    it('clears runError on subsequent successful run', async () => {
      const t = trace()

      // First run fails
      await vitestExpect(
        t.run(async () => {
          await t.step('fail', 'llm', async () => {
            throw new Error('boom')
          })
        }),
      ).rejects.toThrow('boom')

      vitestExpect(t.getResult().error).toBeDefined()

      // Second run succeeds — runError should be cleared
      await t.run(async () => {
        await t.step('ok', 'llm', async () => 'fine')
      })

      vitestExpect(t.getResult().error).toBeUndefined()
      vitestExpect(t.getStepNames()).toEqual(['ok'])
    })

    it('records error on failed step', async () => {
      const t = trace()

      await vitestExpect(
        t.run(async () => {
          await t.step('bad', 'tool', async () => {
            throw new Error('tool failed')
          })
        }),
      ).rejects.toThrow('tool failed')

      const step = t.getStep('bad')
      vitestExpect(step?.error).toBeDefined()
      vitestExpect(step?.error?.message).toBe('tool failed')
    })
  })

  describe('concurrent steps (Promise.all)', () => {
    it('handles concurrent steps without cross-wiring', async () => {
      const t = trace()

      await t.run(async () => {
        const [a, b] = await Promise.all([
          t.step('a', 'llm', async () => {
            await new Promise((r) => setTimeout(r, 20))
            return 'result-a'
          }),
          t.step('b', 'tool', async () => {
            await new Promise((r) => setTimeout(r, 10))
            return 'result-b'
          }),
        ])

        vitestExpect(a).toBe('result-a')
        vitestExpect(b).toBe('result-b')
      })

      vitestExpect(t.getSteps()).toHaveLength(2)
      vitestExpect(t.getStepNames()).toContain('a')
      vitestExpect(t.getStepNames()).toContain('b')
    })

    it('concurrent nested steps stay in their parent', async () => {
      const t = trace()

      await t.run(async () => {
        await t.step('parent', 'custom', async () => {
          const [x, y] = await Promise.all([
            t.step('child-x', 'llm', async () => 'x'),
            t.step('child-y', 'tool', async () => 'y'),
          ])
          return { x, y }
        })
      })

      const parent = t.getStep('parent')
      vitestExpect(parent?.children).toHaveLength(2)
      vitestExpect(parent?.children.map((c) => c.name).sort()).toEqual(['child-x', 'child-y'])
    })
  })

  describe('llmStep and toolStep', () => {
    it('llmStep attaches request context', async () => {
      const t = trace()

      await t.run(async () => {
        await t.llmStep(
          'call',
          { messages: [{ role: 'user', content: 'hi' }], model: 'gpt-4o' },
          async () => ({
            content: 'hello',
            usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
            model: 'gpt-4o',
            finishReason: 'stop' as const,
            raw: null,
          }),
        )
      })

      const step = t.getStep('call')
      vitestExpect(step?.request).toBeDefined()
      vitestExpect(step?.request?.model).toBe('gpt-4o')
      vitestExpect(step?.response).toBeDefined()
      vitestExpect(step?.response?.content).toBe('hello')
    })

    it('toolStep records tool name and params', async () => {
      const t = trace()

      await t.run(async () => {
        await t.toolStep('search', 'web_search', { query: 'test' }, async () => [
          { title: 'Result' },
        ])
      })

      const step = t.getStep('search')
      vitestExpect(step?.input).toEqual({ tool: 'web_search', params: { query: 'test' } })
    })
  })

  describe('getResult', () => {
    it('returns aggregated trace result', async () => {
      const t = trace()

      await t.run(async () => {
        await t.step('llm1', 'llm', async () => ({
          content: 'hi',
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          model: 'gpt-4o',
          finishReason: 'stop' as const,
          raw: null,
        }))
        await t.step('tool1', 'tool', async () => 'data')
        await t.step('llm2', 'llm', async () => ({
          content: 'done',
          usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
          model: 'gpt-4o',
          finishReason: 'stop' as const,
          raw: null,
        }))
      })

      const result = t.getResult()
      vitestExpect(result.totalLLMCalls).toBe(2)
      vitestExpect(result.totalToolCalls).toBe(1)
      vitestExpect(result.totalTokens).toBe(45) // 15 + 30
      vitestExpect(result.totalDuration).toBeGreaterThan(0)
      vitestExpect(result.error).toBeUndefined()
    })
  })

  describe('reset', () => {
    it('clears all state', async () => {
      const t = trace()

      await t.run(async () => {
        await t.step('a', 'llm', async () => 'done')
      })

      vitestExpect(t.getSteps()).toHaveLength(1)

      t.reset()

      vitestExpect(t.getSteps()).toHaveLength(0)
      vitestExpect(t.getStepNames()).toEqual([])
      vitestExpect(t.getTotalDuration()).toBe(0)
    })
  })
})
