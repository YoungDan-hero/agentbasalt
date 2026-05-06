import type { MockToolConfig, MockToolInstance, MockToolCall } from '../core/types.js'

const registeredTools = new Map<string, MockToolConfig & { calls: MockToolCall[] }>()

/** Register a mock tool */
export function mockTool(config: MockToolConfig): MockToolInstance {
  const entry = {
    ...config,
    calls: [] as MockToolCall[],
  }
  registeredTools.set(config.name, entry)

  return {
    name: config.name,
    get calls() {
      return entry.calls
    },
    reset() {
      entry.calls.length = 0
    },
  }
}

/** Get a registered mock tool by name */
export function getMockTool(name: string): (MockToolConfig & { calls: MockToolCall[] }) | undefined {
  return registeredTools.get(name)
}

/** Execute a mock tool call */
export async function executeMockTool(
  name: string,
  params: Record<string, unknown>,
): Promise<{ result: unknown; error?: string; duration: number }> {
  const tool = registeredTools.get(name)

  if (!tool) {
    throw new Error(`Mock tool "${name}" not registered. Use mockTool() to register it.`)
  }

  // Check max calls
  if (tool.maxCalls && tool.calls.length >= tool.maxCalls) {
    throw new Error(
      `Mock tool "${name}" has exceeded maximum calls (${tool.maxCalls}). ` +
      `Called ${tool.calls.length} times.`
    )
  }

  // Check required params
  if (tool.requiredParams) {
    for (const param of tool.requiredParams) {
      if (!(param in params)) {
        throw new Error(
          `Mock tool "${name}" missing required parameter "${param}". ` +
          `Provided: [${Object.keys(params).join(', ')}]`
        )
      }
    }
  }

  // Simulate delay
  if (tool.delay) {
    await new Promise((resolve) => setTimeout(resolve, tool.delay))
  }

  const start = performance.now()
  let result: unknown
  let error: string | undefined

  try {
    if (tool.error) {
      throw typeof tool.error === 'string' ? new Error(tool.error) : tool.error
    }
    result = await tool.handler(params)
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
  }

  const duration = performance.now() - start

  // Record the call
  tool.calls.push({
    params,
    result,
    error,
    timestamp: Date.now(),
    duration,
  })

  if (error) {
    return { result: null, error, duration }
  }

  return { result, duration }
}

/** Clear all registered mock tools */
export function clearMockTools(): void {
  registeredTools.clear()
}

/** Get all registered tool names */
export function getRegisteredToolNames(): string[] {
  return Array.from(registeredTools.keys())
}
