import { AsyncLocalStorage } from 'node:async_hooks'
import type { LLMRequest, LLMResponse, AgentResult } from './types.js'

/** Per-async-context current step tracking (safe for Promise.all) */
const stepStore = new AsyncLocalStorage<TraceStep>()

// ─── Trace Types ────────────────────────────────────────────────────

export type StepType = 'llm' | 'tool' | 'custom'

export interface TraceStep {
  name: string
  type: StepType
  input?: unknown
  output?: unknown
  /** LLM request if this is an LLM step */
  request?: LLMRequest
  /** LLM response if this is an LLM step */
  response?: LLMResponse
  /** AgentResult if available */
  result?: AgentResult
  startTime: number
  endTime: number
  duration: number
  error?: Error
  children: TraceStep[]
}

export interface TraceResult {
  steps: TraceStep[]
  totalDuration: number
  totalLLMCalls: number
  totalToolCalls: number
  totalTokens: number
  totalCost: number
  error?: Error
}

// ─── AgentTrace ─────────────────────────────────────────────────────

/**
 * AgentTrace tracks multi-step agent execution.
 *
 * Usage:
 * ```ts
 * import { trace, expect } from 'agentbasalt'
 *
 * test('agent flow', async () => {
 *   const t = trace()
 *
 *   await t.run(async () => {
 *     const plan = await t.step('plan', 'llm', async () => {
 *       return llm.call('How to answer?')
 *     })
 *     const data = await t.step('search', 'tool', async () => {
 *       return searchAPI(plan.query)
 *     })
 *     await t.step('answer', 'llm', async () => {
 *       return llm.call(`Summarize: ${data}`)
 *     })
 *   })
 *
 *   expect(t).toHaveStepCount(3)
 *   expect(t).toHaveStepSequence(['plan', 'search', 'answer'])
 * })
 * ```
 */
export class AgentTrace {
  private steps: TraceStep[] = []
  private runStartTime = 0
  private runEndTime = 0
  private runError?: Error

  /**
   * Run a traced function. All `step()` calls within are recorded.
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    this.steps = []
    this.runError = undefined
    this.runStartTime = performance.now()

    try {
      const result = await fn()
      return result
    } catch (err) {
      this.runError = err instanceof Error ? err : new Error(String(err))
      throw err
    } finally {
      this.runEndTime = performance.now()
    }
  }

  /**
   * Record a named step in the agent flow.
   *
   * Safe for concurrent use (Promise.all) — uses AsyncLocalStorage
   * to track the current step per async context.
   *
   * @param name - Step name (e.g., 'plan', 'search', 'answer')
   * @param type - Step type: 'llm', 'tool', or 'custom'
   * @param fn - The function to execute
   * @returns The result of fn()
   */
  async step<T>(
    name: string,
    type: StepType,
    fn: () => Promise<T>,
  ): Promise<T> {
    const step: TraceStep = {
      name,
      type,
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
      children: [],
    }

    // Nest under current step if we're inside one (from AsyncLocalStorage)
    const parent = stepStore.getStore()
    if (parent) {
      parent.children.push(step)
    } else {
      this.steps.push(step)
    }

    // Run fn within a new async context with this step as current
    return stepStore.run(step, async () => {
      try {
        const result = await fn()
        step.output = result

        // Auto-detect LLM responses
        if (this.isLLMResponse(result)) {
          step.response = result as LLMResponse
          step.type = 'llm'
        }

        return result
      } catch (err) {
        step.error = err instanceof Error ? err : new Error(String(err))
        throw err
      } finally {
        step.endTime = performance.now()
        step.duration = step.endTime - step.startTime
      }
    })
  }

  /**
   * Record a step with an LLM request/response pair.
   * Use this when you want to explicitly attach request context.
   */
  async llmStep<T>(
    name: string,
    request: LLMRequest,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.step(name, 'llm', async () => {
      const result = await fn()
      const step = this.getCurrentStep()
      if (step) {
        step.request = request
        if (this.isLLMResponse(result)) {
          step.response = result as LLMResponse
        }
      }
      return result
    })
  }

  /**
   * Record a tool call step.
   */
  async toolStep<T>(
    name: string,
    toolName: string,
    params: Record<string, unknown>,
    fn: () => Promise<T>,
  ): Promise<T> {
    return this.step(name, 'tool', async () => {
      const result = await fn()
      const step = this.getCurrentStep()
      if (step) {
        step.input = { tool: toolName, params }
      }
      return result
    })
  }

  /** Get all top-level steps */
  getSteps(): TraceStep[] {
    return [...this.steps]
  }

  /** Get the full trace result */
  getResult(): TraceResult {
    const allSteps = this.flattenSteps(this.steps)
    const llmSteps = allSteps.filter((s) => s.type === 'llm')
    const toolSteps = allSteps.filter((s) => s.type === 'tool')

    return {
      steps: this.steps,
      totalDuration: this.runEndTime - this.runStartTime,
      totalLLMCalls: llmSteps.length,
      totalToolCalls: toolSteps.length,
      totalTokens: this.sumTokens(llmSteps),
      totalCost: 0, // calculated by cost tracker
      error: this.runError,
    }
  }

  /** Get step names in order */
  getStepNames(): string[] {
    return this.steps.map((s) => s.name)
  }

  /** Get a specific step by name */
  getStep(name: string): TraceStep | undefined {
    return this.flattenSteps(this.steps).find((s) => s.name === name)
  }

  /** Get all steps of a specific type */
  getStepsByType(type: StepType): TraceStep[] {
    return this.flattenSteps(this.steps).filter((s) => s.type === type)
  }

  /** Get total duration in ms */
  getTotalDuration(): number {
    return this.runEndTime - this.runStartTime
  }

  /** Reset the trace */
  reset(): void {
    this.steps = []
    this.runStartTime = 0
    this.runEndTime = 0
    this.runError = undefined
  }

  // ─── Private ────────────────────────────────────────────────────

  private getCurrentStep(): TraceStep | undefined {
    return stepStore.getStore()
  }

  private flattenSteps(steps: TraceStep[]): TraceStep[] {
    const result: TraceStep[] = []
    for (const step of steps) {
      result.push(step)
      result.push(...this.flattenSteps(step.children))
    }
    return result
  }

  private sumTokens(steps: TraceStep[]): number {
    let total = 0
    for (const step of steps) {
      if (step.response?.usage) {
        total += step.response.usage.totalTokens
      }
    }
    return total
  }

  private isLLMResponse(value: unknown): boolean {
    if (!value || typeof value !== 'object') return false
    const obj = value as Record<string, unknown>
    return (
      'content' in obj &&
      'model' in obj &&
      ('usage' in obj || 'finishReason' in obj)
    )
  }
}

/** Create a new AgentTrace instance */
export function trace(): AgentTrace {
  return new AgentTrace()
}
