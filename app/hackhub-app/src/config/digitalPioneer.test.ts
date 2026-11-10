import { describe, expect, it } from 'vitest'
import { normalizeDigitalPioneerTrack } from './digitalPioneer'

describe('award category normalization', () => {
  it('uses a named official category before unrelated tags, matching the voting API', () => {
    expect(normalizeDigitalPioneerTrack('  innovation breakthrough ', ['customer', 'team'])).toBe('Innovation Breakthrough')
    expect(normalizeDigitalPioneerTrack('CUSTOMER VALUES', ['team'])).toBe('Customer Values')
    expect(normalizeDigitalPioneerTrack('collaboration to win', ['customer'])).toBe('Collaboration to Win')
  })
  it('preserves legacy category mapping with surrounding whitespace', () => {
    expect(normalizeDigitalPioneerTrack(' Digital Transformation ', ['team'])).toBe('Customer Values')
  })
})
