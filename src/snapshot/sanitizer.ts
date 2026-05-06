import type { SanitizeConfig } from '../core/types.js'

const DEFAULT_PATTERNS = [
  // API keys
  { pattern: /(?:sk-|key-|token-|bearer\s+)[a-zA-Z0-9_-]{20,}/gi, replacement: '[MASKED_API_KEY]' },
  // AWS keys
  { pattern: /(?:AKIA|ABIA|ACCA|ASIA)[A-Z0-9]{16}/g, replacement: '[MASKED_AWS_KEY]' },
  // Emails
  { pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, replacement: '[MASKED_EMAIL]' },
  // Phone numbers (US format)
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[MASKED_PHONE]' },
  // Credit card numbers
  { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[MASKED_CC]' },
  // SSN
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[MASKED_SSN]' },
  // IP addresses
  { pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[MASKED_IP]' },
]

export class Sanitizer {
  private patterns: Array<{ pattern: RegExp; replacement: string }>
  private customSanitizers: Array<(text: string) => string>

  constructor(config?: SanitizeConfig) {
    this.patterns = []
    this.customSanitizers = config?.customSanitizers ?? []

    if (config?.maskApiKeys !== false) {
      this.patterns.push(
        DEFAULT_PATTERNS[0], // API keys
        DEFAULT_PATTERNS[1], // AWS keys
      )
    }

    if (config?.maskEmails !== false) {
      this.patterns.push(DEFAULT_PATTERNS[2]) // Emails
    }
  }

  /** Sanitize a string */
  sanitize(text: string): string {
    let result = text

    for (const { pattern, replacement } of this.patterns) {
      result = result.replace(pattern, replacement)
    }

    for (const sanitizer of this.customSanitizers) {
      result = sanitizer(result)
    }

    return result
  }

  /** Sanitize an object recursively */
  sanitizeObject<T>(obj: T, removeFields?: string[]): T {
    if (typeof obj === 'string') {
      return this.sanitize(obj) as T
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item, removeFields)) as T
    }

    if (obj && typeof obj === 'object') {
      const result: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (removeFields?.includes(key)) continue
        result[key] = this.sanitizeObject(value, removeFields)
      }
      return result as T
    }

    return obj
  }
}
