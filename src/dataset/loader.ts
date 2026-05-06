import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Dataset, DatasetCase, ScenarioInput } from '../core/types.js'

/** Load a dataset from a file (YAML, JSON, or CSV) */
export async function loadDataset<TInput = ScenarioInput, TExpected = Record<string, unknown>>(
  filePath: string,
): Promise<Dataset<TInput, TExpected>> {
  const fullPath = resolve(filePath)
  const content = await readFile(fullPath, 'utf-8')
  const ext = fullPath.split('.').pop()?.toLowerCase()

  switch (ext) {
    case 'json':
      return parseJSON<TInput, TExpected>(content, fullPath)
    case 'yaml':
    case 'yml':
      return parseYAML<TInput, TExpected>(content, fullPath)
    case 'csv':
      return parseCSV<TInput, TExpected>(content, fullPath)
    default:
      throw new Error(`Unsupported dataset format: .${ext}. Use .json, .yaml, or .csv`)
  }
}

function parseJSON<TInput, TExpected>(content: string, path: string): Dataset<TInput, TExpected> {
  const data = JSON.parse(content)

  if (Array.isArray(data)) {
    return {
      name: path.split('/').pop() ?? 'dataset',
      cases: data.map((item, i) => ({
        name: item.name ?? `case-${i}`,
        input: item.input ?? item,
        expected: item.expected ?? {},
        tags: item.tags,
        skip: item.skip,
      })),
    }
  }

  if (data.cases && Array.isArray(data.cases)) {
    return {
      name: data.name ?? path.split('/').pop() ?? 'dataset',
      description: data.description,
      cases: data.cases.map((item: any, i: number) => ({
        name: item.name ?? `case-${i}`,
        input: item.input ?? item,
        expected: item.expected ?? {},
        tags: item.tags,
        skip: item.skip,
      })),
    }
  }

  throw new Error(`Invalid dataset format in ${path}. Expected an array or { cases: [...] }`)
}

function parseYAML<TInput, TExpected>(_content: string, _path: string): Dataset<TInput, TExpected> {
  // Simple YAML parser for basic structures
  // For production, consider using js-yaml as an optional dependency
  throw new Error(
    `YAML parsing requires 'js-yaml' package. Install it with: npm install js-yaml\n` +
    `Or convert your dataset to JSON format.`
  )
}

function parseCSV<TInput, TExpected>(content: string, path: string): Dataset<TInput, TExpected> {
  const lines = content.trim().split('\n')
  if (lines.length < 2) {
    throw new Error(`CSV file ${path} must have at least a header row and one data row`)
  }

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, ''))
  const cases: DatasetCase<TInput, TExpected>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i])
    const record: Record<string, unknown> = {}

    for (let j = 0; j < headers.length; j++) {
      record[headers[j]] = values[j] ?? ''
    }

    cases.push({
      name: (record.name as string) ?? `case-${i}`,
      input: (record.input ?? record) as TInput,
      expected: (record.expected ?? {}) as TExpected,
      tags: record.tags ? String(record.tags).split(';') : undefined,
      skip: record.skip === 'true',
    })
  }

  return {
    name: path.split('/').pop() ?? 'dataset',
    cases,
  }
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  result.push(current.trim())

  return result
}

/**
 * Run test scenarios from a dataset.
 *
 * Usage:
 * ```ts
 * const dataset = await loadDataset('./test-data/cases.json')
 * testScenario('classification', dataset, async (input, agent) => {
 *   const result = await agent.run(input.text)
 *   expect(result).toHaveRespondedContaining(input.expected)
 * })
 * ```
 */
export function testScenario<TInput = ScenarioInput, TExpected = Record<string, unknown>>(
  name: string,
  dataset: Dataset<TInput, TExpected>,
  fn: (input: TInput, expected: TExpected, context: { name: string; tags?: string[] }) => Promise<void> | void,
): void {
  // Import test dynamically to avoid circular deps
  const { test, skip } = require('../core/runner.js')

  for (const testCase of dataset.cases) {
    const testName = testCase.name ? `${name} > ${testCase.name}` : name

    if (testCase.skip) {
      skip(testName, () => {})
    } else {
      test(testName, () => fn(testCase.input, testCase.expected, {
        name: testCase.name ?? testName,
        tags: testCase.tags,
      }))
    }
  }
}
