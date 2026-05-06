import { describe, it, expect } from 'vitest'
import { Matcher } from '../src/mock/matcher.js'
import type { LLMRequest } from '../src/core/types.js'

function req(content: string, model = 'gpt-4o'): LLMRequest {
  return {
    messages: [{ role: 'user', content }],
    model,
  }
}

describe('Matcher', () => {
  describe('match() — mock matching', () => {
    it('matches by contains (case-insensitive)', () => {
      const m = new Matcher()
      expect(m.match(req('What is the weather?'), { contains: 'weather' })).toBe(true)
      expect(m.match(req('What is the WEATHER?'), { contains: 'weather' })).toBe(true)
      expect(m.match(req('Hello'), { contains: 'weather' })).toBe(false)
    })

    it('matches by exact content', () => {
      const m = new Matcher()
      expect(m.match(req('ping'), { exact: 'ping' })).toBe(true)
      expect(m.match(req('ping pong'), { exact: 'ping' })).toBe(false)
    })

    it('matches by regex pattern', () => {
      const m = new Matcher()
      expect(m.match(req('weather in Tokyo'), { pattern: 'weather.*tokyo' })).toBe(true)
      expect(m.match(req('weather in Paris'), { pattern: 'weather.*tokyo' })).toBe(false)
    })

    it('matches by model', () => {
      const m = new Matcher()
      expect(m.match(req('hi', 'gpt-4o'), { model: 'gpt-4o', contains: 'hi' })).toBe(true)
      expect(m.match(req('hi', 'claude-3'), { model: 'gpt-4o', contains: 'hi' })).toBe(false)
    })

    it('matches by custom function', () => {
      const m = new Matcher()
      expect(m.match(req('test'), { custom: (r) => r.model === 'gpt-4o' })).toBe(true)
      expect(m.match(req('test', 'other'), { custom: (r) => r.model === 'gpt-4o' })).toBe(false)
    })

    it('returns false when no criteria match', () => {
      const m = new Matcher()
      expect(m.match(req('test'), {})).toBe(false)
    })
  })

  describe('findBestMatch() — replay matching', () => {
    it('finds exact match', () => {
      const m = new Matcher()
      const interactions = [
        { request: req('hello') },
        { request: req('world') },
      ]

      const result = m.findBestMatch(req('hello'), interactions)
      expect(result).not.toBeNull()
      expect(result!.request.messages[0].content).toBe('hello')
    })

    it('finds contains match', () => {
      const m = new Matcher()
      const interactions = [
        { request: req('weather in Tokyo') },
      ]

      const result = m.findBestMatch(req('what is the weather in Tokyo today'), interactions, 'contains')
      expect(result).not.toBeNull()
    })

    it('returns null when no match found', () => {
      const m = new Matcher()
      const interactions = [
        { request: req('completely different') },
      ]

      const result = m.findBestMatch(req('no match'), interactions, 'exact')
      expect(result).toBeNull()
    })

    it('requires model to match', () => {
      const m = new Matcher()
      const interactions = [
        { request: req('hello', 'gpt-4o') },
      ]

      const result = m.findBestMatch(req('hello', 'claude-3'), interactions, 'exact')
      expect(result).toBeNull()
    })
  })
})
