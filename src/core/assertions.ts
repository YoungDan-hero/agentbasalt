import type { AgentResult, CostTracker } from './types.js'
import type { AgentTrace, TraceStep, StepType } from './trace.js'

// ─── Assertion Error ────────────────────────────────────────────────

export class AssertionError extends Error {
  constructor(
    message: string,
    public readonly expected?: unknown,
    public readonly actual?: unknown,
  ) {
    super(message)
    this.name = 'AssertionError'
  }
}

// ─── Expect (Agent-flavored) ────────────────────────────────────────

interface AssertionResult {
  pass: boolean
  message: string
}

export class AgentExpect {
  private _isNot = false
  private assertionCount = 0

  constructor(private result: AgentResult | CostTracker) {}

  get not(): this {
    this._isNot = !this.isNot
    return this
  }

  private get isNot(): boolean {
    return this._isNot
  }

  private assert(check: AssertionResult): void {
    this.assertionCount++
    if (this.isNot ? check.pass : !check.pass) {
      throw new AssertionError(
        this.isNot ? `NOT: ${check.message}` : check.message
      )
    }
  }

  // ─── Tool Call Assertions ───────────────────────────────────────

  /** Assert that a specific tool was called */
  toHaveCalledTool(name: string, args?: Record<string, unknown>): void {
    const result = this.result as AgentResult
    const found = result.toolCalls.find((tc) => tc.name === name)

    if (!found) {
      this.assert({
        pass: false,
        message: `Expected tool "${name}" to be called, but it was not. Called tools: [${result.toolCalls.map((t) => t.name).join(', ')}]`,
      })
      return
    }

    if (args) {
      for (const [key, value] of Object.entries(args)) {
        const actual = found.arguments[key]
        if (JSON.stringify(actual) !== JSON.stringify(value)) {
          this.assert({
            pass: false,
            message: `Expected tool "${name}" argument "${key}" to be ${JSON.stringify(value)}, but got ${JSON.stringify(actual)}`,
          })
          return
        }
      }
    }

    this.assert({ pass: true, message: '' })
  }

  /** Assert tool was NOT called */
  toHaveNotCalledTool(name: string): void {
    const result = this.result as AgentResult
    const found = result.toolCalls.find((tc) => tc.name === name)
    this.assert({
      pass: !found,
      message: `Expected tool "${name}" to NOT be called, but it was`,
    })
  }

  /** Assert the number of tool calls */
  toHaveToolCallCount(count: number): void {
    const result = this.result as AgentResult
    this.assert({
      pass: result.toolCalls.length === count,
      message: `Expected ${count} tool calls, but got ${result.toolCalls.length}`,
    })
  }

  // ─── Response Content Assertions ────────────────────────────────

  /** Assert response contains a substring */
  toHaveRespondedContaining(text: string): void {
    const result = this.result as AgentResult
    const pass = result.content.toLowerCase().includes(text.toLowerCase())
    this.assert({
      pass,
      message: `Expected response to contain "${text}", but got: "${result.content.slice(0, 200)}"`,
    })
  }

  /** Assert response matches a regex */
  toHaveRespondedMatching(pattern: RegExp): void {
    const result = this.result as AgentResult
    const pass = pattern.test(result.content)
    this.assert({
      pass,
      message: `Expected response to match ${pattern}, but got: "${result.content.slice(0, 200)}"`,
    })
  }

  /** Assert response equals exact string */
  toHaveRespondedWith(text: string): void {
    const result = this.result as AgentResult
    this.assert({
      pass: result.content === text,
      message: `Expected response to be "${text}", but got: "${result.content.slice(0, 200)}"`,
    })
  }

  /** Assert response is empty */
  toHaveEmptyResponse(): void {
    const result = this.result as AgentResult
    this.assert({
      pass: result.content.trim().length === 0,
      message: `Expected empty response, but got: "${result.content.slice(0, 200)}"`,
    })
  }

  // ─── Token / Cost Assertions ────────────────────────────────────

  /** Assert total tokens used is less than a threshold */
  toHaveUsedTokensLessThan(count: number): void {
    const result = this.result as AgentResult
    this.assert({
      pass: result.usage.totalTokens < count,
      message: `Expected token usage < ${count}, but used ${result.usage.totalTokens}`,
    })
  }

  /** Assert total tokens used is more than a threshold */
  toHaveUsedTokensMoreThan(count: number): void {
    const result = this.result as AgentResult
    this.assert({
      pass: result.usage.totalTokens > count,
      message: `Expected token usage > ${count}, but used ${result.usage.totalTokens}`,
    })
  }

  /** Assert cost is less than a threshold (USD) */
  toHaveCostLessThan(amount: number): void {
    const tracker = this.result as CostTracker
    this.assert({
      pass: tracker.totalCost < amount,
      message: `Expected cost < $${amount.toFixed(4)}, but cost was $${tracker.totalCost.toFixed(4)}`,
    })
  }

  /** Assert cost tracker token count */
  toHaveTokenCountLessThan(count: number): void {
    const tracker = this.result as CostTracker
    this.assert({
      pass: tracker.totalTokens < count,
      message: `Expected token count < ${count}, but got ${tracker.totalTokens}`,
    })
  }

  // ─── Performance Assertions ─────────────────────────────────────

  /** Assert completion time is within a threshold (ms) */
  toHaveCompletedWithin(ms: number): void {
    const result = this.result as AgentResult
    this.assert({
      pass: result.duration < ms,
      message: `Expected completion within ${ms}ms, but took ${Math.round(result.duration)}ms`,
    })
  }

  // ─── Model Assertions ───────────────────────────────────────────

  /** Assert which model was used */
  toHaveUsedModel(model: string): void {
    const result = this.result as AgentResult
    this.assert({
      pass: result.model.includes(model),
      message: `Expected model "${model}", but used "${result.model}"`,
    })
  }

  // ─── Finish Reason Assertions ───────────────────────────────────

  /** Assert finish reason */
  toHaveFinishReason(reason: string): void {
    const result = this.result as AgentResult
    this.assert({
      pass: result.finishReason === reason,
      message: `Expected finish reason "${reason}", but got "${result.finishReason}"`,
    })
  }

  // ─── Generic Equality ───────────────────────────────────────────

  /** Assert strict equality */
  toBe(expected: unknown): void {
    const result = this.result as AgentResult
    this.assert({
      pass: result === expected,
      message: `Expected ${JSON.stringify(expected)}, but got ${JSON.stringify(result)}`,
    })
  }

  /** Assert deep equality */
  toEqual(expected: unknown): void {
    const result = this.result as AgentResult
    this.assert({
      pass: JSON.stringify(result) === JSON.stringify(expected),
      message: `Expected deep equality with ${JSON.stringify(expected)}`,
    })
  }

  /** Assert value is truthy */
  toBeTruthy(): void {
    this.assert({
      pass: !!this.result,
      message: `Expected truthy value, but got ${JSON.stringify(this.result)}`,
    })
  }

  /** Get the number of assertions made */
  getAssertionCount(): number {
    return this.assertionCount
  }
}

// ─── Trace Expect ───────────────────────────────────────────────────

export class TraceExpect {
  private _isNot = false
  private assertionCount = 0

  constructor(private trace: AgentTrace) {}

  get not(): this {
    this._isNot = !this.isNot
    return this
  }

  private get isNot(): boolean {
    return this._isNot
  }

  private assert(check: AssertionResult): void {
    this.assertionCount++
    if (this.isNot ? check.pass : !check.pass) {
      throw new AssertionError(
        this.isNot ? `NOT: ${check.message}` : check.message
      )
    }
  }

  /** Assert the number of top-level steps */
  toHaveStepCount(count: number): void {
    const steps = this.trace.getSteps()
    this.assert({
      pass: steps.length === count,
      message: `Expected ${count} steps, but got ${steps.length}: [${steps.map((s) => s.name).join(', ')}]`,
    })
  }

  /** Assert the step names in order */
  toHaveStepSequence(names: string[]): void {
    const actual = this.trace.getStepNames()
    const pass = JSON.stringify(actual) === JSON.stringify(names)
    this.assert({
      pass,
      message: `Expected step sequence [${names.join(', ')}], but got [${actual.join(', ')}]`,
    })
  }

  /** Assert a specific step exists */
  toHaveStep(name: string, options?: { type?: StepType }): void {
    const step = this.trace.getStep(name)
    if (!step) {
      const allNames = this.trace.getSteps().map((s) => s.name)
      this.assert({
        pass: false,
        message: `Expected step "${name}" to exist, but it was not found. Steps: [${allNames.join(', ')}]`,
      })
      return
    }

    if (options?.type && step.type !== options.type) {
      this.assert({
        pass: false,
        message: `Expected step "${name}" to have type "${options.type}", but got "${step.type}"`,
      })
      return
    }

    this.assert({ pass: true, message: '' })
  }

  /** Assert a step does NOT exist */
  toNotHaveStep(name: string): void {
    const step = this.trace.getStep(name)
    this.assert({
      pass: !step,
      message: `Expected step "${name}" to NOT exist, but it does`,
    })
  }

  /** Assert the number of LLM steps */
  toHaveLLMCallCount(count: number): void {
    const llmSteps = this.trace.getStepsByType('llm')
    this.assert({
      pass: llmSteps.length === count,
      message: `Expected ${count} LLM calls, but got ${llmSteps.length}`,
    })
  }

  /** Assert the number of tool steps */
  toHaveToolCallCount(count: number): void {
    const toolSteps = this.trace.getStepsByType('tool')
    this.assert({
      pass: toolSteps.length === count,
      message: `Expected ${count} tool calls, but got ${toolSteps.length}`,
    })
  }

  /** Assert total duration is within threshold (ms) */
  toHaveTotalDurationLessThan(ms: number): void {
    const duration = this.trace.getTotalDuration()
    this.assert({
      pass: duration < ms,
      message: `Expected total duration < ${ms}ms, but took ${Math.round(duration)}ms`,
    })
  }

  /** Assert total tokens used across all LLM steps */
  toHaveTotalTokensLessThan(count: number): void {
    const result = this.trace.getResult()
    this.assert({
      pass: result.totalTokens < count,
      message: `Expected total tokens < ${count}, but used ${result.totalTokens}`,
    })
  }

  /** Assert that no step failed with an error */
  toHaveNoErrors(): void {
    const allSteps = this.trace.getSteps()
    const errorStep = this.findErrorStep(allSteps)
    this.assert({
      pass: !errorStep,
      message: errorStep
        ? `Expected no errors, but step "${errorStep.name}" failed: ${errorStep.error?.message}`
        : '',
    })
  }

  getAssertionCount(): number {
    return this.assertionCount
  }

  private findErrorStep(steps: TraceStep[]): TraceStep | undefined {
    for (const step of steps) {
      if (step.error) return step
      if (step.children.length > 0) {
        const child = this.findErrorStep(step.children)
        if (child) return child
      }
    }
    return undefined
  }
}

// ─── Factory ────────────────────────────────────────────────────────

/** Create an expect instance for an AgentResult or CostTracker */
export function expect(result: AgentResult | CostTracker): AgentExpect
/** Create an expect instance for an AgentTrace */
export function expect(trace: AgentTrace): TraceExpect
export function expect(target: AgentResult | CostTracker | AgentTrace): AgentExpect | TraceExpect {
  if (target && typeof target === 'object' && 'getSteps' in target && typeof target.getSteps === 'function') {
    return new TraceExpect(target as AgentTrace)
  }
  return new AgentExpect(target as AgentResult | CostTracker)
}
