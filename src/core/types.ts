// ─── LLM Request / Response ─────────────────────────────────────────

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCallId?: string
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface Tool {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export interface Usage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface LLMRequest {
  messages: Message[]
  model: string
  tools?: Tool[]
  temperature?: number
  maxTokens?: number
  [key: string]: unknown
}

export interface LLMResponse {
  content: string
  toolCalls?: ToolCall[]
  usage: Usage
  model: string
  finishReason: 'stop' | 'tool_calls' | 'length' | 'content_filter'
  raw: unknown
}

// ─── Agent Result ───────────────────────────────────────────────────

export interface AgentResult {
  content: string
  toolCalls: ToolCall[]
  usage: Usage
  duration: number
  model: string
  finishReason: string
  steps: AgentStep[]
  raw: unknown
}

export interface AgentStep {
  type: 'llm_call' | 'tool_call' | 'tool_result'
  timestamp: number
  data: LLMResponse | ToolCall | ToolResult
}

export interface ToolResult {
  toolCallId: string
  name: string
  result: unknown
  error?: string
  duration: number
}

// ─── Adapter ────────────────────────────────────────────────────────

export interface AgentAdapter {
  name: string
  /** Wrap an LLM client to intercept calls based on engine mode */
  wrapClient(client: unknown, handler: RequestHandler): unknown
  /** Extract a unified AgentResult from a raw provider response */
  extractResult(response: unknown): AgentResult
  /** Identify this adapter's provider (for cassette matching) */
  provider: string
}

/**
 * RequestHandler — the core interaction point between engine and adapter.
 *
 * The adapter calls `handler.handle(request, originalCall)` where:
 * - request: the normalized LLM request
 * - originalCall: a function that calls the real API (only used in record/passthrough mode)
 *
 * The handler decides what to do based on the engine's mode:
 * - mock: return predefined response, ignore originalCall
 * - replay: return recorded response, ignore originalCall
 * - record: call originalCall, record the result, return it
 * - passthrough: call originalCall, return it without recording
 */
export interface RequestHandler {
  handle(
    request: LLMRequest,
    originalCall: () => Promise<LLMResponse>,
  ): Promise<LLMResponse>
}

// ─── Engine Config ──────────────────────────────────────────────────

export type AgentBasaltMode = 'record' | 'replay' | 'mock' | 'passthrough'

export interface AgentBasaltConfig {
  mode: AgentBasaltMode
  cassetteDir?: string
  /** Name for the cassette file when recording (default: 'default') */
  cassetteName?: string
  mockResponses?: MockResponseEntry[]
  /** Sanitize sensitive data when recording */
  sanitize?: SanitizeConfig
  /** Custom match strategy for replay */
  matchStrategy?: MatchStrategy
}

export interface MockResponseEntry {
  /** Match criteria */
  match: MockMatch
  /** The response to return */
  response: Partial<LLMResponse>
}

export interface MockMatch {
  /** Match by message content (substring) */
  contains?: string
  /** Match by exact message content */
  exact?: string
  /** Match by regex pattern on the last user message */
  pattern?: string
  /** Match by model name */
  model?: string
  /** Custom matcher function */
  custom?: (request: LLMRequest) => boolean
}

// ─── Mock ───────────────────────────────────────────────────────────

export type MatchStrategy = 'exact' | 'contains' | 'pattern' | 'fuzzy'

export interface MockToolConfig {
  name: string
  handler: (params: Record<string, unknown>) => unknown | Promise<unknown>
  /** Maximum number of times this tool can be called (0 = unlimited) */
  maxCalls?: number
  /** Required parameter names — throws if missing */
  requiredParams?: string[]
  /** Record real calls for later replay */
  record?: boolean
  /** Simulate latency in ms */
  delay?: number
  /** Error to throw instead of returning result */
  error?: string | Error
}

export interface MockToolInstance {
  name: string
  calls: MockToolCall[]
  reset(): void
}

export interface MockToolCall {
  params: Record<string, unknown>
  result?: unknown
  error?: string
  timestamp: number
  duration: number
}

// ─── Cassette (Recording) ───────────────────────────────────────────

export interface Cassette {
  id: string
  name: string
  recordedAt: string
  agentBasaltVersion: string
  interactions: Interaction[]
  metadata?: Record<string, unknown>
}

export interface Interaction {
  request: LLMRequest
  response: LLMResponse
  timestamp: number
  duration: number
}

// ─── Sanitize ───────────────────────────────────────────────────────

export interface SanitizeConfig {
  /** Mask API keys in recorded data */
  maskApiKeys?: boolean
  /** Mask email addresses */
  maskEmails?: boolean
  /** Custom sanitizer functions */
  customSanitizers?: Array<(text: string) => string>
  /** Fields to completely remove from cassettes */
  removeFields?: string[]
}

// ─── Snapshot ───────────────────────────────────────────────────────

export interface Snapshot {
  name: string
  value: unknown
  updatedAt: string
}

// ─── Dataset ────────────────────────────────────────────────────────

export interface Dataset<TInput = Record<string, unknown>, TExpected = Record<string, unknown>> {
  name: string
  description?: string
  cases: DatasetCase<TInput, TExpected>[]
}

export interface DatasetCase<TInput = Record<string, unknown>, TExpected = Record<string, unknown>> {
  name?: string
  input: TInput
  expected: TExpected
  tags?: string[]
  skip?: boolean
}

export interface ScenarioInput {
  text: string
  [key: string]: unknown
}

// ─── Cost ───────────────────────────────────────────────────────────

export interface CostTracker {
  /** Total cost in USD */
  totalCost: number
  /** Total tokens used */
  totalTokens: number
  /** Prompt tokens */
  promptTokens: number
  /** Completion tokens */
  completionTokens: number
  /** Number of LLM calls */
  callCount: number
  /** Track a result or promise */
  track(result: AgentResult | Promise<AgentResult>): Promise<AgentResult>
  /** Reset counters */
  reset(): void
  /** Get detailed breakdown */
  breakdown(): CostBreakdown[]
}

export interface CostBreakdown {
  model: string
  calls: number
  promptTokens: number
  completionTokens: number
  cost: number
}

// ─── Runner ─────────────────────────────────────────────────────────

export interface RunnerConfig {
  mode: AgentBasaltMode
  reporter: string
  watch?: boolean
  files?: string[]
  concurrency?: number
  timeout?: number
  bail?: boolean
}

export interface TestContext {
  /** Current test name */
  name: string
  /** Current suite name */
  suite?: string
  /** Timeout in ms */
  timeout: number
  /** Skip this test */
  skip(): void
  /** Mark as todo */
  todo(): void
}

export interface SuiteContext {
  name: string
  tests: TestDefinition[]
}

export interface TestDefinition {
  name: string
  fn: () => Promise<void> | void
  timeout?: number
  skip?: boolean
  todo?: boolean
}

export interface TestResult {
  name: string
  suite?: string
  status: 'pass' | 'fail' | 'skip' | 'todo'
  duration: number
  error?: Error
  assertions: number
}

export interface SuiteResult {
  name: string
  tests: TestResult[]
  duration: number
}

export interface RunResult {
  suites: SuiteResult[]
  totalTests: number
  passed: number
  failed: number
  skipped: number
  todo: number
  duration: number
}

// ─── Reporter ───────────────────────────────────────────────────────

export interface Reporter {
  onSuiteStart(name: string): void
  onSuiteEnd(result: SuiteResult): void
  onTestStart(name: string): void
  onTestEnd(result: TestResult): void
  onRunEnd(result: RunResult): void
}
