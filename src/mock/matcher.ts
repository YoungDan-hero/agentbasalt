import type { LLMRequest, MockMatch, MatchStrategy } from '../core/types.js'

export class Matcher {
  constructor(private defaultStrategy: MatchStrategy = 'contains') {}

  match(request: LLMRequest, criteria: MockMatch): boolean {
    const lastUserMessage = this.getLastUserMessage(request)

    // Match by model
    if (criteria.model && request.model !== criteria.model) {
      return false
    }

    // Match by exact content
    if (criteria.exact) {
      return lastUserMessage === criteria.exact
    }

    // Match by substring
    if (criteria.contains) {
      return lastUserMessage.toLowerCase().includes(criteria.contains.toLowerCase())
    }

    // Match by regex
    if (criteria.pattern) {
      const regex = new RegExp(criteria.pattern, 'i')
      return regex.test(lastUserMessage)
    }

    // Match by custom function
    if (criteria.custom) {
      return criteria.custom(request)
    }

    return false
  }

  /** Find the best matching interaction from a cassette */
  findBestMatch(
    request: LLMRequest,
    interactions: Array<{ request: LLMRequest }>,
    strategy?: MatchStrategy,
  ): { request: LLMRequest } | null {
    const strat = strategy ?? this.defaultStrategy

    // Try exact match first
    for (const interaction of interactions) {
      if (this.requestsMatch(request, interaction.request, 'exact')) {
        return interaction
      }
    }

    // Then try contains
    if (strat === 'contains' || strat === 'fuzzy') {
      for (const interaction of interactions) {
        if (this.requestsMatch(request, interaction.request, 'contains')) {
          return interaction
        }
      }
    }

    // Then try pattern
    if (strat === 'pattern' || strat === 'fuzzy') {
      for (const interaction of interactions) {
        if (this.requestsMatch(request, interaction.request, 'pattern')) {
          return interaction
        }
      }
    }

    // Fuzzy: use similarity score
    if (strat === 'fuzzy') {
      let best: { request: LLMRequest } | null = null
      let bestScore = 0

      for (const interaction of interactions) {
        const score = this.similarityScore(request, interaction.request)
        if (score > bestScore && score > 0.7) {
          bestScore = score
          best = interaction
        }
      }

      return best
    }

    return null
  }

  private requestsMatch(a: LLMRequest, b: LLMRequest, strategy: MatchStrategy): boolean {
    // Model must match
    if (a.model !== b.model) return false

    const aMessages = a.messages.filter((m) => m.role !== 'system')
    const bMessages = b.messages.filter((m) => m.role !== 'system')

    if (aMessages.length !== bMessages.length) return false

    for (let i = 0; i < aMessages.length; i++) {
      const aContent = aMessages[i].content
      const bContent = bMessages[i].content

      switch (strategy) {
        case 'exact':
          if (aContent !== bContent) return false
          break
        case 'contains':
          if (!aContent.toLowerCase().includes(bContent.toLowerCase()) &&
              !bContent.toLowerCase().includes(aContent.toLowerCase())) {
            return false
          }
          break
        case 'pattern':
          // Use the recorded message as a pattern
          try {
            const regex = new RegExp(bContent, 'i')
            if (!regex.test(aContent)) return false
          } catch {
            if (aContent !== bContent) return false
          }
          break
        case 'fuzzy':
          if (this.stringSimilarity(aContent, bContent) < 0.8) return false
          break
      }
    }

    return true
  }

  private similarityScore(a: LLMRequest, b: LLMRequest): number {
    const aText = a.messages.map((m) => m.content).join('\n')
    const bText = b.messages.map((m) => m.content).join('\n')
    return this.stringSimilarity(aText, bText)
  }

  /** Simple Levenshtein-based similarity (0-1) */
  private stringSimilarity(a: string, b: string): number {
    if (a === b) return 1
    if (a.length === 0 || b.length === 0) return 0

    const maxLen = Math.max(a.length, b.length)
    const distance = this.levenshtein(a.slice(0, 200), b.slice(0, 200))
    return 1 - distance / Math.min(200, maxLen)
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = []

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i]
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        const cost = b[i - 1] === a[j - 1] ? 0 : 1
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        )
      }
    }

    return matrix[b.length][a.length]
  }

  private getLastUserMessage(request: LLMRequest): string {
    const userMessages = request.messages.filter((m) => m.role === 'user')
    return userMessages[userMessages.length - 1]?.content ?? ''
  }
}
