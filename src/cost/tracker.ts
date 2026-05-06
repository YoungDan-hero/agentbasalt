import type { CostTracker as ICostTracker, CostBreakdown, AgentResult, Usage } from '../core/types.js'

// ─── Model Pricing (USD per 1M tokens) ──────────────────────────────

const MODEL_PRICING: Record<string, { prompt: number; completion: number }> = {
  // OpenAI
  'gpt-4o': { prompt: 2.5, completion: 10 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6 },
  'gpt-4-turbo': { prompt: 10, completion: 30 },
  'gpt-4': { prompt: 30, completion: 60 },
  'gpt-3.5-turbo': { prompt: 0.5, completion: 1.5 },
  'o1': { prompt: 15, completion: 60 },
  'o1-mini': { prompt: 3, completion: 12 },
  'o3-mini': { prompt: 1.1, completion: 4.4 },

  // Anthropic
  'claude-sonnet-4-20250514': { prompt: 3, completion: 15 },
  'claude-3-5-sonnet-20241022': { prompt: 3, completion: 15 },
  'claude-3-5-haiku-20241022': { prompt: 0.8, completion: 4 },
  'claude-3-opus-20240229': { prompt: 15, completion: 75 },
  'claude-3-haiku-20240307': { prompt: 0.25, completion: 1.25 },
}

// ─── Cost Tracker Implementation ────────────────────────────────────

export class AgentCostTracker implements ICostTracker {
  private _totalCost = 0
  private _totalTokens = 0
  private _promptTokens = 0
  private _completionTokens = 0
  private _callCount = 0
  private _breakdown = new Map<string, CostBreakdown>()

  get totalCost(): number {
    return this._totalCost
  }

  get totalTokens(): number {
    return this._totalTokens
  }

  get promptTokens(): number {
    return this._promptTokens
  }

  get completionTokens(): number {
    return this._completionTokens
  }

  get callCount(): number {
    return this._callCount
  }

  /** Track a result or promise */
  async track(result: AgentResult | Promise<AgentResult>): Promise<AgentResult> {
    const resolved = await result
    this.recordUsage(resolved.model, resolved.usage)
    return resolved
  }

  /** Record usage manually */
  recordUsage(model: string, usage: Usage): void {
    this._callCount++
    this._promptTokens += usage.promptTokens
    this._completionTokens += usage.completionTokens
    this._totalTokens += usage.totalTokens

    const cost = this.calculateCost(model, usage)
    this._totalCost += cost

    // Update breakdown
    const existing = this._breakdown.get(model)
    if (existing) {
      existing.calls++
      existing.promptTokens += usage.promptTokens
      existing.completionTokens += usage.completionTokens
      existing.cost += cost
    } else {
      this._breakdown.set(model, {
        model,
        calls: 1,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cost,
      })
    }
  }

  /** Reset all counters */
  reset(): void {
    this._totalCost = 0
    this._totalTokens = 0
    this._promptTokens = 0
    this._completionTokens = 0
    this._callCount = 0
    this._breakdown.clear()
  }

  /** Get detailed breakdown by model */
  breakdown(): CostBreakdown[] {
    return Array.from(this._breakdown.values())
  }

  /** Calculate cost for a single call */
  private calculateCost(model: string, usage: Usage): number {
    // Find pricing (match partial model name)
    const pricing = this.findPricing(model)
    if (!pricing) return 0

    const promptCost = (usage.promptTokens / 1_000_000) * pricing.prompt
    const completionCost = (usage.completionTokens / 1_000_000) * pricing.completion

    return promptCost + completionCost
  }

  private findPricing(model: string): { prompt: number; completion: number } | null {
    // Exact match
    if (MODEL_PRICING[model]) return MODEL_PRICING[model]

    // Partial match (e.g., "gpt-4o-2024-08-06" matches "gpt-4o")
    for (const [key, value] of Object.entries(MODEL_PRICING)) {
      if (model.startsWith(key) || model.includes(key)) {
        return value
      }
    }

    return null
  }
}

/** Create a new cost tracker instance */
export function costTracker(): AgentCostTracker {
  return new AgentCostTracker()
}

/** Get the built-in pricing table */
export function getModelPricing(): Record<string, { prompt: number; completion: number }> {
  return { ...MODEL_PRICING }
}
