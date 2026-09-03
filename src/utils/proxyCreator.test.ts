jest.mock('http-proxy', () => {
  const mockUnderlyingWeb = jest.fn()
  return {
    __mockUnderlyingWeb: mockUnderlyingWeb,
    createProxyServer: jest.fn(() => ({
      on: jest.fn(),
      web: mockUnderlyingWeb,
    })),
  }
})

import { buildProxyBuffer, createPooledProxy, proxyHeaders } from './proxyCreator'

function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ''
    stream.on('data', (chunk) => (data += chunk))
    stream.on('end', () => resolve(data))
    stream.on('error', reject)
  })
}

describe('buildProxyBuffer', () => {
  it('returns undefined when there is no body', () => {
    expect(buildProxyBuffer({ headers: {} })).toBeUndefined()
  })

  it('returns undefined when the body is not an object', () => {
    expect(buildProxyBuffer({ body: 'a string', headers: {} })).toBeUndefined()
  })

  it('returns an explicit "{}" stream for an empty body on POST', async () => {
    const req = { body: {}, method: 'POST', headers: {} }
    const stream = buildProxyBuffer(req)
    expect(stream).toBeDefined()
    expect(await streamToString(stream as NodeJS.ReadableStream)).toBe('{}')
    expect(req.headers['content-length']).toBe('2')
  })

  it('returns undefined for an empty body on GET', () => {
    const req = { body: {}, method: 'GET', headers: {} }
    expect(buildProxyBuffer(req)).toBeUndefined()
  })

  it('returns undefined for upload routes', () => {
    const req = { body: { a: 1 }, method: 'POST', headers: {}, originalUrl: '/storage/upload/foo' }
    expect(buildProxyBuffer(req)).toBeUndefined()
  })

  it('serialises a non-empty body and sets content-length', async () => {
    const req = { body: { a: 1 }, method: 'POST', headers: {}, originalUrl: '/proxies/v8/something' }
    const stream = buildProxyBuffer(req)
    expect(await streamToString(stream as NodeJS.ReadableStream)).toBe(JSON.stringify({ a: 1 }))
    expect(req.headers['content-length']).toBe(String(Buffer.byteLength(JSON.stringify({ a: 1 }))))
  })

  it('drops a stale transfer-encoding header when setting content-length', () => {
    const req = {
      body: { a: 1 },
      headers: { 'transfer-encoding': 'chunked' },
      method: 'PUT',
      originalUrl: '/proxies/v8/something',
    }
    buildProxyBuffer(req)
    expect(req.headers['transfer-encoding']).toBeUndefined()
  })
})

describe('proxyHeaders', () => {
  // tslint:disable-next-line: no-any
  function buildReq(overrides: any = {}) {
    return {
      header: () => undefined,
      headers: {},
      kauth: { grant: { access_token: { content: { sub: 'f:org:user-1' }, token: 'token-1' } } },
      originalUrl: '/proxies/v8/something',
      session: {},
      ...overrides,
    }
  }

  it('injects auth/routing headers and calls next', () => {
    const req = buildReq({ session: { channel: 'ch-1', rootOrgId: 'org-1', userRoles: ['ADMIN'] } })
    const next = jest.fn()
    proxyHeaders(req, {}, next)
    expect(req.headers['x-channel-id']).toBe('org-1')
    expect(req.headers['x-authenticated-user-orgid']).toBe('org-1')
    expect(req.headers['x-authenticated-user-orgname']).toBe('ch-1')
    expect(req.headers['x-authenticated-user-channel']).toBe('ch-1')
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('falls back to the configured channel id when the session has none', () => {
    const req = buildReq()
    proxyHeaders(req, {}, jest.fn())
    expect(req.headers['x-channel-id']).toBeDefined()
  })

  it('adds the nodebb uid header only when the session has one', () => {
    const withUid = buildReq({ session: { uid: 'uid-1' } })
    proxyHeaders(withUid, {}, jest.fn())
    expect(withUid.headers['x-authenticated-user-nodebb-uid']).toBe('uid-1')

    const withoutUid = buildReq()
    proxyHeaders(withoutUid, {}, jest.fn())
    expect(withoutUid.headers['x-authenticated-user-nodebb-uid']).toBeUndefined()
  })

  it('marks the session cookie secure and injects _uid for discussion routes', () => {
    const req = buildReq({
      body: {},
      originalUrl: '/discussion/v2/topics',
      session: { cookie: {}, uid: 'uid-1' },
    })
    proxyHeaders(req, {}, jest.fn())
    expect(req.session.cookie.secure).toBe(true)
    expect(req.body._uid).toBe('uid-1')
  })

  it('does not touch discussion fields for the discussion create route', () => {
    const req = buildReq({
      body: {},
      originalUrl: '/discussion/user/v1/create',
      session: { cookie: {}, uid: 'uid-1' },
    })
    proxyHeaders(req, {}, jest.fn())
    expect(req.session.cookie.secure).toBeUndefined()
    expect(req.body._uid).toBeUndefined()
  })
})

describe('createPooledProxy', () => {
  it('injects a keep-alive agent into options before delegating to the underlying .web()', () => {
    // tslint:disable-next-line: no-var-requires
    const { __mockUnderlyingWeb } = require('http-proxy')
    __mockUnderlyingWeb.mockClear()

    const pooled = createPooledProxy({})
    pooled.web({} as never, {} as never, { target: 'https://example.com' } as never)

    expect(__mockUnderlyingWeb).toHaveBeenCalledWith(
      {},
      {},
      expect.objectContaining({ target: 'https://example.com', agent: expect.anything() })
    )
  })
})
