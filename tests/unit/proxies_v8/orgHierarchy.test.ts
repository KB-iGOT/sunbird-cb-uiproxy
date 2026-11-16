jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    submit: jest.fn(),
  }))
})

jest.mock('http-proxy', () => {
  // tslint:disable-next-line: no-any
  const mockWeb = jest.fn((_req: any, res: any, options: any) => {
    res.status(200).json({ proxied: true, target: options && options.target })
  })
  return {
    __mockWeb: mockWeb,
    createProxyServer: jest.fn(() => ({
      on: jest.fn(),
      web: mockWeb,
    })),
  }
})

import { EventEmitter } from 'events'
import express, { NextFunction, Request, RequestHandler, Response } from 'express'
import fileUpload from 'express-fileupload'
import FormData from 'form-data'
import supertest from 'supertest'
import { proxiesV8 } from '../../../src/proxies_v8/proxies_v8'
import { CONSTANTS } from '../../../src/utils/env'

// tslint:disable-next-line: no-var-requires
const { __mockWeb } = require('http-proxy') as { __mockWeb: jest.Mock }
const mockedFormDataCtor = FormData as unknown as jest.Mock

// tslint:disable-next-line: no-any
function buildApp(sessionOverrides: Record<string, any> = {}, includeKauth = true) {
  const app = express()
  app.use(express.json())
  app.use(fileUpload() as unknown as RequestHandler)
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // tslint:disable-next-line: no-any
    const mutableReq = req as any
    if (includeKauth) {
      mutableReq.kauth = {
        grant: {
          access_token: {
            content: { sub: 'f:kc-realm:user-123' },
            token: 'user-jwt-token',
          },
        },
      }
    }
    mutableReq.session = {
      channel: 'TN Dept',
      rootOrgId: 'root-org-1',
      userRoles: ['MDO_ADMIN'],
      ...sessionOverrides,
    }
    next()
  })
  app.use('/proxies/v8', proxiesV8)
  return app
}

function sendProxyRequest(app: express.Application, method: 'get' | 'patch' | 'post', url: string, body?: object) {
  if (method === 'get') {
    return supertest(app).get(url)
  }
  if (method === 'patch') {
    return supertest(app).patch(url).send(body || {})
  }
  return supertest(app).post(url).send(body || {})
}

function mockFormDataSubmit(
  // tslint:disable-next-line: no-any
  submitHandler: (_opts: any, cb: (err: unknown, response: unknown) => void) => void
) {
  const mockFormInstance = {
    append: jest.fn(),
    submit: jest.fn(submitHandler),
  }
  mockedFormDataCtor.mockImplementationOnce(() => mockFormInstance)
  return mockFormInstance
}

function createFakeStreamResponse(statusCode: number) {
  return Object.assign(new EventEmitter(), { statusCode })
}

interface IPassthroughRouteCase {
  body?: object
  kongPath: string
  method: 'get' | 'patch' | 'post'
  proxyPath: string
}

describe('proxiesV8 org hierarchy bulk link upload route', () => {
  it('returns 500 when no file or data upload is present in the request', async () => {
    const res = await supertest(buildApp())
      .post('/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1')
      .send({})

    expect(res.status).toBe(500)
    expect(res.text).toBe('File not found in the request')
  })

  it('returns 500 when multipart upload contains neither file nor data field', async () => {
    const res = await supertest(buildApp())
      .post('/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1')
      .attach('other', Buffer.from('a,b'), 'links.csv')

    expect(res.status).toBe(500)
    expect(res.text).toBe('File not found in the request')
  })

  it('falls back to empty header values when session org/channel and kauth token are absent', async () => {
    const mockFormInstance = mockFormDataSubmit((_opts, cb) => {
      const fakeResponse = createFakeStreamResponse(200)
      cb(null, fakeResponse)
      fakeResponse.emit('data', Buffer.from(JSON.stringify({ ok: true })))
      fakeResponse.emit('end')
    })

    const res = await supertest(buildApp({ channel: undefined, rootOrgId: undefined }, false))
      .post('/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1')
      .set('wid', 'wid-user-1')
      .attach('file', Buffer.from('a,b'), 'links.csv')

    expect(res.status).toBe(200)
    expect(mockFormInstance.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          'x-authenticated-user-channel': '',
          'x-authenticated-user-orgid': '',
          'x-authenticated-user-orgname': '',
          'x-authenticated-user-token': '',
          'x-authenticated-userid': 'wid-user-1',
        },
      }),
      expect.any(Function)
    )
  })

  it('forwards multipart file uploads to kong:8000 with expected headers and parses 200 JSON response', async () => {
    const mockFormInstance = mockFormDataSubmit((_opts, cb) => {
      const fakeResponse = createFakeStreamResponse(200)
      cb(null, fakeResponse)
      fakeResponse.emit('data', Buffer.from(JSON.stringify({ responseCode: 'OK', result: { count: 2 } })))
      fakeResponse.emit('end')
    })

    const res = await supertest(buildApp())
      .post('/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1')
      .attach('file', Buffer.from('parent,child\na,b'), 'links.csv')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ responseCode: 'OK', result: { count: 2 } })
    expect(mockFormInstance.append).toHaveBeenCalledWith(
      'file',
      expect.any(Buffer),
      {
        contentType: expect.any(String),
        filename: 'links.csv',
      }
    )
    expect(mockFormInstance.submit).toHaveBeenCalledWith(
      {
        headers: {
          Authorization: CONSTANTS.SB_API_KEY,
          'x-authenticated-user-channel': 'TN%20Dept',
          'x-authenticated-user-orgid': 'root-org-1',
          'x-authenticated-user-orgname': 'TN%20Dept',
          'x-authenticated-user-token': 'user-jwt-token',
          'x-authenticated-userid': 'f:kc-realm:user-123',
        },
        host: 'kong',
        path: '/org/v2/hierarchy/bulk/link/root-org-1',
        port: 8000,
      },
      expect.any(Function)
    )
  })

  it('accepts req.files.data uploads and falls back to plain text on 201 non-JSON responses', async () => {
    const mockFormInstance = mockFormDataSubmit((_opts, cb) => {
      const fakeResponse = createFakeStreamResponse(201)
      cb(null, fakeResponse)
      fakeResponse.emit('data', Buffer.from('created'))
      fakeResponse.emit('end')
    })

    const res = await supertest(buildApp({ channel: '', rootOrgId: '' }))
      .post('/proxies/v8/org/v2/hierarchy/bulk/link/root-org-2')
      .attach('data', Buffer.from('parent,child\nx,y'), 'bulk.csv')

    expect(res.status).toBe(201)
    expect(res.text).toBe('created')
    expect(mockFormInstance.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/org/v2/hierarchy/bulk/link/root-org-2',
      }),
      expect.any(Function)
    )
  })

  it('forwards non-2xx upstream status codes and response body', async () => {
    mockFormDataSubmit((_opts, cb) => {
      const fakeResponse = createFakeStreamResponse(400)
      cb(null, fakeResponse)
      fakeResponse.emit('data', Buffer.from('{"err":"INVALID_CSV"}'))
      fakeResponse.emit('end')
    })

    const res = await supertest(buildApp())
      .post('/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1')
      .attach('file', Buffer.from('bad'), 'bad.csv')

    expect(res.status).toBe(400)
    expect(res.text).toBe('{"err":"INVALID_CSV"}')
  })

  it('returns 502 when formData.submit fails to reach kong', async () => {
    mockFormDataSubmit((_opts, cb) => {
      cb(new Error('ECONNREFUSED'), null)
    })

    const res = await supertest(buildApp())
      .post('/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1')
      .attach('file', Buffer.from('a,b'), 'links.csv')

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Request failed', message: 'Error: ECONNREFUSED' })
  })

  it('returns 502 when the upstream response stream emits an error', async () => {
    mockFormDataSubmit((_opts, cb) => {
      const fakeResponse = createFakeStreamResponse(200)
      cb(null, fakeResponse)
      fakeResponse.emit('error', new Error('stream reset'))
    })

    const res = await supertest(buildApp())
      .post('/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1')
      .attach('file', Buffer.from('a,b'), 'links.csv')

    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Stream failed' })
  })
})

describe('proxiesV8 org hierarchy pass-through routes under /org/*', () => {
  const passthroughRoutes: IPassthroughRouteCase[] = [
    {
      kongPath: '/org/v2/hierarchy/org-123/complete',
      method: 'get',
      proxyPath: '/proxies/v8/org/v2/hierarchy/org-123/complete',
    },
    {
      body: { request: { includeSubOrgs: true } },
      kongPath: '/org/v2/hierarchy/read/org-123',
      method: 'post',
      proxyPath: '/proxies/v8/org/v2/hierarchy/read/org-123',
    },
    {
      body: { parentOrgId: 'p1', subOrgId: 'c1' },
      kongPath: '/org/v2/hierarchy/link',
      method: 'post',
      proxyPath: '/proxies/v8/org/v2/hierarchy/link',
    },
    {
      body: { parentOrgId: 'p1', subOrgId: 'c1' },
      kongPath: '/org/v2/hierarchy/unlink',
      method: 'post',
      proxyPath: '/proxies/v8/org/v2/hierarchy/unlink',
    },
    {
      body: { newParentOrgId: 'p2', orgId: 'c1' },
      kongPath: '/org/v2/hierarchy/move',
      method: 'post',
      proxyPath: '/proxies/v8/org/v2/hierarchy/move',
    },
    {
      body: { levels: ['MINISTRY', 'DEPARTMENT'] },
      kongPath: '/org/v2/hierarchy/levels/root-org-1',
      method: 'patch',
      proxyPath: '/proxies/v8/org/v2/hierarchy/levels/root-org-1',
    },
    {
      kongPath: '/org/v2/hierarchy/bulk/link/root-org-1/sample',
      method: 'get',
      proxyPath: '/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1/sample',
    },
    {
      kongPath: '/org/v2/hierarchy/bulk/link/root-org-1/export',
      method: 'get',
      proxyPath: '/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1/export',
    },
  ]

  it('forwards non-bulk org hierarchy endpoints to KONG_API_BASE with injected proxy headers', async () => {
    for (const route of passthroughRoutes) {
      __mockWeb.mockClear()
      const res = await sendProxyRequest(buildApp(), route.method, route.proxyPath, route.body)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({
        proxied: true,
        target: `${CONSTANTS.KONG_API_BASE}${route.kongPath}`,
      })
      expect(__mockWeb).toHaveBeenCalledTimes(1)

      const [proxiedReq, , proxyOpts] = __mockWeb.mock.calls[0]
      expect(proxyOpts).toEqual(
        expect.objectContaining({
          changeOrigin: true,
          ignorePath: true,
          target: `${CONSTANTS.KONG_API_BASE}${route.kongPath}`,
        })
      )
      expect(proxiedReq.headers).toEqual(
        expect.objectContaining({
          authorization: CONSTANTS.SB_API_KEY,
          'x-authenticated-user-orgid': 'root-org-1',
          'x-authenticated-user-token': 'user-jwt-token',
          'x-authenticated-userid': 'user-123',
        })
      )
    }
  })
})

