export interface DiffResult {
  path: string
  type: 'added' | 'removed' | 'changed'
  expected?: unknown
  actual?: unknown
}

/** Compare two values and return a list of differences */
export function diff(expected: unknown, actual: unknown, path = ''): DiffResult[] {
  const results: DiffResult[] = []

  if (expected === actual) return results

  if (typeof expected !== typeof actual) {
    results.push({
      path: path || '(root)',
      type: 'changed',
      expected,
      actual,
    })
    return results
  }

  if (typeof expected === 'string' || typeof expected === 'number' || typeof expected === 'boolean') {
    if (expected !== actual) {
      results.push({
        path: path || '(root)',
        type: 'changed',
        expected,
        actual,
      })
    }
    return results
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const maxLen = Math.max(expected.length, actual.length)
    for (let i = 0; i < maxLen; i++) {
      const itemPath = `${path}[${i}]`
      if (i >= expected.length) {
        results.push({ path: itemPath, type: 'added', actual: actual[i] })
      } else if (i >= actual.length) {
        results.push({ path: itemPath, type: 'removed', expected: expected[i] })
      } else {
        results.push(...diff(expected[i], actual[i], itemPath))
      }
    }
    return results
  }

  if (expected && typeof expected === 'object' && actual && typeof actual === 'object') {
    const expectedKeys = new Set(Object.keys(expected as object))
    const actualKeys = new Set(Object.keys(actual as object))

    for (const key of expectedKeys) {
      const propPath = path ? `${path}.${key}` : key
      if (!actualKeys.has(key)) {
        results.push({ path: propPath, type: 'removed', expected: (expected as any)[key] })
      } else {
        results.push(...diff((expected as any)[key], (actual as any)[key], propPath))
      }
    }

    for (const key of actualKeys) {
      if (!expectedKeys.has(key)) {
        const propPath = path ? `${path}.${key}` : key
        results.push({ path: propPath, type: 'added', actual: (actual as any)[key] })
      }
    }

    return results
  }

  results.push({
    path: path || '(root)',
    type: 'changed',
    expected,
    actual,
  })

  return results
}

/** Format a diff result as a human-readable string */
export function formatDiff(results: DiffResult[]): string {
  if (results.length === 0) return 'No differences'

  return results
    .map((r) => {
      const icon = r.type === 'added' ? '+' : r.type === 'removed' ? '-' : '~'
      const value = r.type === 'added'
        ? `actual: ${JSON.stringify(r.actual)}`
        : r.type === 'removed'
          ? `expected: ${JSON.stringify(r.expected)}`
          : `expected: ${JSON.stringify(r.expected)}, actual: ${JSON.stringify(r.actual)}`

      return `  ${icon} ${r.path}: ${value}`
    })
    .join('\n')
}
