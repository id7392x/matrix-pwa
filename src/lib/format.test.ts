import { describe, expect, it } from 'vitest'

import { formatLastEventTs } from '$lib/format'

describe('formatLastEventTs', () => {
  it('returns an empty string for a missing timestamp', () => {
    expect(formatLastEventTs(0)).toBe('')
  })

  it('formats a same-day timestamp as a local time', () => {
    expect(formatLastEventTs(Date.now())).toMatch(/^\d{2}:\d{2}$/)
  })

  it('formats an older timestamp as a date', () => {
    const ts = new Date(2020, 0, 15, 12, 0, 0).getTime()
    expect(formatLastEventTs(ts)).toContain('2020')
  })
})
