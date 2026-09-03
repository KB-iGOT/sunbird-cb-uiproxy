import {
  esBasicAuth,
  getDateRangeString,
  getEmailLocalPart,
  getStringifiedQueryParams,
  range,
  validateInputWithRegex,
} from './helpers'

describe('range', () => {
  it('yields 0..end-1 with the default step', () => {
    expect([...range(5)]).toEqual([0, 1, 2, 3, 4])
  })

  it('honors a custom step', () => {
    expect([...range(10, 3)]).toEqual([0, 3, 6, 9])
  })

  it('yields nothing when end is 0', () => {
    expect([...range(0)]).toEqual([])
  })
})

describe('getStringifiedQueryParams', () => {
  it('joins truthy entries as key=value pairs', () => {
    expect(getStringifiedQueryParams({ a: '1', b: '2' })).toBe('a=1&b=2')
  })

  it('drops falsy values', () => {
    expect(getStringifiedQueryParams({ a: '1', b: '', c: undefined, d: 0 })).toBe('a=1')
  })

  it('returns an empty string for an empty object', () => {
    expect(getStringifiedQueryParams({})).toBe('')
  })
})

describe('esBasicAuth', () => {
  it('returns a base64-encoded "username:password" string', () => {
    const decoded = Buffer.from(esBasicAuth(), 'base64').toString('utf8')
    expect(decoded).toContain(':')
  })
})

describe('getEmailLocalPart', () => {
  it('returns the part before the @ sign', () => {
    expect(getEmailLocalPart('john.doe@example.com')).toBe('john.doe')
  })

  it('returns the whole string when there is no @ sign', () => {
    expect(getEmailLocalPart('not-an-email')).toBe('not-an-email')
  })
})

describe('getDateRangeString', () => {
  // NOTE: getDateRangeString formats with date-fns v2 using v1-style tokens ('DD', 'YYYY'),
  // which date-fns v2's format() rejects by throwing. The catch block then always returns ''.
  // These tests pin the current (broken) behavior; see PERFORMANCE_ANALYSIS-adjacent bug notes.
  it('returns an empty string for a single-day range (format() throws on legacy tokens)', () => {
    const d = new Date('2026-01-15T00:00:00.000Z')
    expect(getDateRangeString(d, d)).toBe('')
  })

  it('returns an empty string for a range spanning different years', () => {
    const start = new Date('2025-12-30T00:00:00.000Z')
    const end = new Date('2026-01-05T00:00:00.000Z')
    expect(getDateRangeString(start, end)).toBe('')
  })

  it('returns an empty string for a range spanning different months', () => {
    const start = new Date('2026-01-28T00:00:00.000Z')
    const end = new Date('2026-02-03T00:00:00.000Z')
    expect(getDateRangeString(start, end)).toBe('')
  })

  it('returns an empty string on invalid input', () => {
    expect(getDateRangeString('not-a-date', 'also-not-a-date')).toBe('')
  })
})

describe('validateInputWithRegex', () => {
  it('resolves false when input is falsy', async () => {
    await expect(validateInputWithRegex('', /.*/)).resolves.toBe(false)
  })

  it('resolves true when the regex matches', async () => {
    await expect(validateInputWithRegex('abc123', /^[a-z0-9]+$/)).resolves.toBe(true)
  })

  it('resolves false when the regex does not match', async () => {
    await expect(validateInputWithRegex('abc!!!', /^[a-z0-9]+$/)).resolves.toBe(false)
  })
})
