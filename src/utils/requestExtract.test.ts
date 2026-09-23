import {
  extractAuthorizationFromRequest,
  extractRootOrgFromRequest,
  extractUserEmailFromRequest,
  extractUserId,
  extractUserIdFromRequest,
  extractUserNameFromRequest,
  extractUserSessionState,
  extractUserToken,
  extractUserTokenContent,
  extractUserTokenFromRequest,
  getUUID,
  IAuthorizedRequest,
} from './requestExtract'

// tslint:disable-next-line: no-any
function buildRequest(overrides: any = {}): IAuthorizedRequest {
  const headers = overrides.headers || {}
  return {
    header: (name: string) => headers[name.toLowerCase()],
    kauth: overrides.kauth,
    // tslint:disable-next-line: no-any
  } as any
}

const kauthWith = (content: object) => ({
  grant: { access_token: { content, token: 'the-token' } },
})

describe('extractUserIdFromRequest', () => {
  it('returns the wid header when present', () => {
    const req = buildRequest({ headers: { wid: 'wid-1' }, kauth: kauthWith({ sub: 'sub-1' }) })
    expect(extractUserIdFromRequest(req)).toBe('wid-1')
  })

  it('falls back to kauth sub when no wid header', () => {
    const req = buildRequest({ kauth: kauthWith({ sub: 'sub-1' }) })
    expect(extractUserIdFromRequest(req)).toBe('sub-1')
  })
})

describe('extractUserId', () => {
  it('returns the wid header when present', () => {
    const req = buildRequest({ headers: { wid: 'wid-1' } })
    expect(extractUserId(req)).toBe('wid-1')
  })

  it('splits the kauth sub on ":" and returns the third segment', () => {
    const req = buildRequest({ kauth: kauthWith({ sub: 'f:org:user-1' }) })
    expect(extractUserId(req)).toBe('user-1')
  })
})

describe('extractUserNameFromRequest', () => {
  it('returns the name from kauth content', () => {
    const req = buildRequest({ kauth: kauthWith({ name: 'Jane Doe' }) })
    expect(extractUserNameFromRequest(req)).toBe('Jane Doe')
  })

  it('returns undefined when kauth is missing', () => {
    const req = buildRequest()
    expect(extractUserNameFromRequest(req)).toBeUndefined()
  })
})

describe('extractUserEmailFromRequest', () => {
  it('prefers the email field over preferred_username', () => {
    const req = buildRequest({ kauth: kauthWith({ email: 'a@b.com', preferred_username: 'a' }) })
    expect(extractUserEmailFromRequest(req)).toBe('a@b.com')
  })

  it('falls back to preferred_username when email is absent', () => {
    const req = buildRequest({ kauth: kauthWith({ preferred_username: 'a' }) })
    expect(extractUserEmailFromRequest(req)).toBe('a')
  })
})

describe('extractUserSessionState', () => {
  it('returns the session_state from kauth content', () => {
    const req = buildRequest({ kauth: kauthWith({ session_state: 'state-1' }) })
    expect(extractUserSessionState(req)).toBe('state-1')
  })
})

describe('extractUserTokenContent', () => {
  it('returns the full kauth content object', () => {
    const content = { sub: 'sub-1' }
    const req = buildRequest({ kauth: kauthWith(content) })
    expect(extractUserTokenContent(req)).toEqual(content)
  })

  it('returns undefined when kauth is missing', () => {
    expect(extractUserTokenContent(buildRequest())).toBeUndefined()
  })
})

describe('extractUserToken', () => {
  it('returns the raw access token', () => {
    const req = buildRequest({ kauth: kauthWith({}) })
    expect(extractUserToken(req)).toBe('the-token')
  })
})

describe('extractAuthorizationFromRequest', () => {
  it('prefixes the token with Bearer', () => {
    const req = buildRequest({ kauth: kauthWith({}) })
    expect(extractAuthorizationFromRequest(req)).toBe('Bearer the-token')
  })
})

describe('extractUserTokenFromRequest', () => {
  it('reads the X-Authenticated-User-Token header', () => {
    const req = buildRequest({ headers: { 'x-authenticated-user-token': 'header-token' } })
    expect(extractUserTokenFromRequest(req)).toBe('header-token')
  })
})

describe('extractRootOrgFromRequest', () => {
  it('reads the rootorg header', () => {
    const req = buildRequest({ headers: { rootorg: 'org-1' } })
    expect(extractRootOrgFromRequest(req)).toBe('org-1')
  })
})

describe('getUUID', () => {
  it('returns a non-empty string', () => {
    const id = getUUID()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('returns a different value on each call', () => {
    expect(getUUID()).not.toBe(getUUID())
  })
})
