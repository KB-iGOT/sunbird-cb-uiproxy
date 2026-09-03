jest.mock('./whitelistApis', () => ({
  API_LIST: {
    URL: {
      '/apis/no-checks': { checksNeeded: [] },
      '/apis/pattern/:id': { checksNeeded: [] },
      '/apis/role-check': { checksNeeded: ['ROLE_CHECK'], ROLE_CHECK: ['MDO_ADMIN'] },
    },
    URL_PATTERN: ['/apis/pattern/:id'],
  },
}))

jest.mock('./custom-keycloak', () => ({
  deauthenticateKeycloakSession: jest.fn().mockResolvedValue(undefined),
}))

import { apiWhiteListLogger, isAllowed } from './apiWhiteList'
import { deauthenticateKeycloakSession } from './custom-keycloak'
import { CONSTANTS } from './env'

const mockedDeauth = deauthenticateKeycloakSession as jest.Mock

// tslint:disable-next-line: no-any
function buildRes() {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  res.end = jest.fn().mockReturnValue(res)
  res.setHeader = jest.fn().mockReturnValue(res)
  res.redirect = jest.fn().mockReturnValue(res)
  res.get = jest.fn().mockReturnValue('host.example.com')
  return res
}

// tslint:disable-next-line: no-any
function buildReq(path: string, overrides: any = {}): any {
  return { get: jest.fn().mockReturnValue('host.example.com'), path, session: {}, ...overrides }
}

describe('isAllowed', () => {
  const middleware = isAllowed()

  afterEach(() => {
    // tslint:disable-next-line: no-any
    (CONSTANTS as any).PORTAL_API_WHITELIST_CHECK = 'true'
  })

  it('calls next unconditionally when whitelisting is disabled', () => {
    // tslint:disable-next-line: no-any
    (CONSTANTS as any).PORTAL_API_WHITELIST_CHECK = 'false'
    const next = jest.fn()
    middleware(buildReq('/anything'), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('allows the root path without whitelist lookup', () => {
    const next = jest.fn()
    middleware(buildReq('/'), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('allows static asset paths', () => {
    const next = jest.fn()
    middleware(buildReq('/assets/logo.png'), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('allows paths containing /resource without a whitelist lookup', () => {
    const next = jest.fn()
    middleware(buildReq('/apis/resource/foo'), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('calls next for a whitelisted url with no checks needed', () => {
    const next = jest.fn()
    middleware(buildReq('/apis/no-checks'), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('matches a URL_PATTERN entry and allows it through when it needs no checks', () => {
    const next = jest.fn()
    middleware(buildReq('/apis/pattern/123'), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('responds 403 for a url that is not whitelisted at all', () => {
    const next = jest.fn()
    const res = buildRes()
    middleware(buildReq('/apis/unknown-route'), res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('allows a role-gated url when the session has a matching role', async () => {
    const next = jest.fn()
    const req = buildReq('/apis/role-check', { session: { userRoles: ['MDO_ADMIN'] } })
    middleware(req, buildRes(), next)
    // executeChecks resolves asynchronously
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('responds 403 for a role-gated url when the session lacks the role', async () => {
    const next = jest.fn()
    const res = buildRes()
    const req = buildReq('/apis/role-check', { session: { userRoles: ['PUBLIC'] } })
    middleware(req, res, next)
    await new Promise((resolve) => setImmediate(resolve))
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})

describe('apiWhiteListLogger', () => {
  const middleware = apiWhiteListLogger()

  it('calls next for the root path', async () => {
    const next = jest.fn()
    await middleware(buildReq('/'), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('calls next for a static asset path', async () => {
    const next = jest.fn()
    await middleware(buildReq('/assets/app.js'), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('calls next for a /resource path without evaluating the session', async () => {
    const next = jest.fn()
    await middleware(buildReq('/apis/resource/foo', { session: undefined }), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('calls next when the request has no session', async () => {
    const next = jest.fn()
    await middleware(buildReq('/apis/no-checks', { session: undefined }), buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('responds 419 and deauthenticates when the session has no userRoles', async () => {
    const next = jest.fn()
    const res = buildRes()
    await middleware(buildReq('/apis/no-checks', { session: {} }), res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(419)
    expect(mockedDeauth).toHaveBeenCalled()
  })

  it('responds 419 when the session has an empty userRoles array', async () => {
    const next = jest.fn()
    const res = buildRes()
    await middleware(buildReq('/apis/no-checks', { session: { userRoles: [] } }), res, next)
    expect(res.status).toHaveBeenCalledWith(419)
  })

  it('calls next for a whitelisted url when the session has roles', async () => {
    const next = jest.fn()
    const req = buildReq('/apis/no-checks', { session: { userRoles: ['PUBLIC'] } })
    await middleware(req, buildRes(), next)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('responds 403 for a non-whitelisted url even with an authenticated session', async () => {
    const next = jest.fn()
    const res = buildRes()
    const req = buildReq('/apis/unknown-route', { session: { userRoles: ['PUBLIC'] } })
    await middleware(req, res, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(403)
  })
})
