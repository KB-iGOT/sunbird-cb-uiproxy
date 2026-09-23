import { getHeaders, getOrg, getRootOrg } from './header'

// tslint:disable-next-line: no-any
function buildReq(headers: Record<string, string> = {}): any {
  return {
    header: (name: string) => headers[name],
    kauth: { grant: { access_token: { content: { sub: 'user-1' } } } },
  }
}

describe('getOrg', () => {
  it('returns the org header when present', () => {
    expect(getOrg(buildReq({ org: 'dopt' }))).toBe('dopt')
  })

  it('defaults to "iGOT Ltd" when absent', () => {
    expect(getOrg(buildReq())).toBe('iGOT Ltd')
  })
})

describe('getRootOrg', () => {
  it('returns the rootOrg header when present', () => {
    expect(getRootOrg(buildReq({ rootOrg: 'igot' }))).toBe('igot')
  })

  it('defaults to "iGOT" when absent', () => {
    expect(getRootOrg(buildReq())).toBe('iGOT')
  })
})

describe('getHeaders', () => {
  it('combines org, rootOrg and the extracted user id with the shared axios config', () => {
    const headers = getHeaders(buildReq({ org: 'dopt', rootOrg: 'igot' }))
    expect(headers.org).toBe('dopt')
    expect(headers.rootOrg).toBe('igot')
    expect(headers.wid).toBe('user-1')
  })
})
