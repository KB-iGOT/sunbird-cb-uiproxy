jest.mock('axios')

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { axiosRequestConfig } from '../../../src/configs/request.config'
import { socialApi } from '../../../src/protectedApi_v8/socialv2'
import { CONSTANTS } from '../../../src/utils/env'

const mockedAxios = axios as unknown as jest.Mock & { post: jest.Mock; put: jest.Mock; delete: jest.Mock }

const NODE = CONSTANTS.NODE_API_BASE
const SOCIAL_CONFIG = { ...axiosRequestConfig, timeout: Number(CONSTANTS.SOCIAL_TIMEOUT) }
const GENERAL_ERROR = { error: 'Failed due to unknown reason' }
const ORG_HEADERS: Record<string, string> = { org: 'o1', rootOrg: 'r1' }

function buildApp(withAuth = true) {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    if (withAuth) {
      req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    }
    next()
  })
  app.use(socialApi)
  return app
}

// Normalises every way the router can call axios into { method, url, data, config }
function upstreamCalls() {
  // tslint:disable-next-line: no-any
  const withData = (method: string) => (call: any[]) => ({ method, url: call[0], data: call[1], config: call[2] })
  // tslint:disable-next-line: no-any
  const deleteCall = (call: any[]) => {
    // tslint:disable-next-line: no-any
    const { data, ...config } = call[1] as any
    return { method: 'delete', url: call[0], data, config }
  }
  // tslint:disable-next-line: no-any
  const requestCall = (call: any[]) => {
    // tslint:disable-next-line: no-any
    const { data, method, url, ...config } = call[0] as any
    return { method: String(method).toLowerCase(), url, data, config }
  }
  return [
    ...mockedAxios.post.mock.calls.map(withData('post')),
    ...mockedAxios.put.mock.calls.map(withData('put')),
    ...mockedAxios.delete.mock.calls.map(deleteCall),
    ...mockedAxios.mock.calls.map(requestCall),
  ]
}

function mockAllUpstream(impl: () => Promise<unknown>) {
  mockedAxios.mockImplementation(impl)
  mockedAxios.post.mockImplementation(impl)
  mockedAxios.put.mockImplementation(impl)
  mockedAxios.delete.mockImplementation(impl)
}

interface IRouteCase {
  path: string
  verb: 'post' | 'put'
  upstreamMethod: string
  url: string
  // expected upstream body (key order matters) for request body { a: 1 } with org/rootOrg headers and kauth sub 'user-1'
  body: object
  config: object
}

const REQ_BODY = { a: 1 }
const ORG_BODY = { a: 1, org: 'o1', rootOrg: 'r1' }
const USER_BODY = { a: 1, org: 'o1', rootOrg: 'r1', userId: 'user-1' }

// upstream path is relative to NODE_API_BASE
function routeCase(
  path: string, upstreamPath: string, body: object, config: object,
  verb: 'post' | 'put' = 'post', upstreamMethod: string = verb
): IRouteCase {
  return { body, config, path, upstreamMethod, url: `${NODE}${upstreamPath}`, verb }
}

const ROUTES: IRouteCase[] = [
  routeCase('/post/publish', '/authtool/publishpost', ORG_BODY, axiosRequestConfig),
  routeCase('/post/draft', '/authtool/draftpost', ORG_BODY, axiosRequestConfig),
  routeCase('/edit/tags', '/authtool/edittags', ORG_BODY, axiosRequestConfig, 'put'),
  routeCase('/edit/meta', '/authtool/editmeta', ORG_BODY, axiosRequestConfig, 'put'),
  routeCase('/post/delete', '/authtool/deletepost', ORG_BODY, axiosRequestConfig, 'post', 'delete'),
  routeCase('/post/autocomplete', '/post/autocomplete', ORG_BODY, axiosRequestConfig),
  routeCase('/post/viewConversation', '/post/viewConversation', ORG_BODY, axiosRequestConfig),
  routeCase('/post/viewConversationV2', '/post/viewConversationv2', ORG_BODY, axiosRequestConfig),
  routeCase('/post/timeline', '/post/timeline', ORG_BODY, SOCIAL_CONFIG),
  routeCase('/post/timelineV2', '/post/timelinev2', USER_BODY, SOCIAL_CONFIG),
  routeCase('/post/activity/create', '/useractivity/create', ORG_BODY, axiosRequestConfig),
  routeCase('/post/acceptAnswer', '/useractivity/acceptAnswer', ORG_BODY, axiosRequestConfig),
  routeCase('/post/activity/users', '/post/users', ORG_BODY, axiosRequestConfig),
  routeCase('/post/search', '/search/searchv1', ORG_BODY, axiosRequestConfig),
  routeCase('/catalog', '/catalog/fetch', { a: 1, org: 'o1', rootOrg: 'r1', userid: 'user-1' }, axiosRequestConfig),
]

beforeEach(() => {
  mockAllUpstream(() => Promise.resolve({ data: { ok: true }, status: 201 }))
})

describe.each(ROUTES)('socialApi $verb $path', (route) => {
  const send = (app = buildApp(), headers: Record<string, string> = ORG_HEADERS, body: object = REQ_BODY) =>
    supertest(app)[route.verb](route.path).set(headers).send(body)

  it('forwards the request upstream and relays status and body', async () => {
    const res = await send()
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ ok: true })
    const calls = upstreamCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe(route.upstreamMethod)
    expect(calls[0].url).toBe(route.url)
    expect(calls[0].data).toEqual(route.body)
    expect(Object.keys(calls[0].data)).toEqual(Object.keys(route.body))
    expect(calls[0].config).toEqual(route.config)
  })

  it('lets org/rootOrg headers override body fields', async () => {
    await send(buildApp(), ORG_HEADERS, { org: 'x', rootOrg: 'y' })
    const data = upstreamCalls()[0].data
    expect(data.org).toBe('o1')
    expect(data.rootOrg).toBe('r1')
  })

  it('returns 400 without calling upstream when org is missing', async () => {
    const res = await send(buildApp(), { rootOrg: 'r1' })
    expect(res.status).toBe(400)
    expect(res.text).toBe('ERROR_NO_ORG_DATA')
    expect(upstreamCalls()).toHaveLength(0)
  })

  it('returns 400 without calling upstream when rootOrg is missing', async () => {
    const res = await send(buildApp(), { org: 'o1' })
    expect(res.status).toBe(400)
    expect(res.text).toBe('ERROR_NO_ORG_DATA')
    expect(upstreamCalls()).toHaveLength(0)
  })

  it('forwards the upstream error status and body', async () => {
    mockAllUpstream(() => Promise.reject({ response: { data: { error: 'bad' }, status: 404 } }))
    const res = await send()
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'bad' })
  })

  it('falls back to 500 with the general error body', async () => {
    mockAllUpstream(() => Promise.reject(new Error('network down')))
    const res = await send()
    expect(res.status).toBe(500)
    expect(res.body).toEqual(GENERAL_ERROR)
  })
})

describe('socialApi (v2) user id resolution', () => {
  it('POST /post/timelineV2 uses the wid header over the token subject', async () => {
    await supertest(buildApp()).post('/post/timelineV2').set({ ...ORG_HEADERS, wid: 'wid-1' }).send({})
    expect(upstreamCalls()[0].data).toEqual({ org: 'o1', rootOrg: 'r1', userId: 'wid-1' })
  })

  it('POST /post/timelineV2 ignores the wid query parameter', async () => {
    await supertest(buildApp()).post('/post/timelineV2?wid=q-1').set(ORG_HEADERS).send({})
    expect(upstreamCalls()[0].data).toEqual({ org: 'o1', rootOrg: 'r1', userId: 'user-1' })
  })

  it('POST /catalog sends an undefined userid when there is no token', async () => {
    await supertest(buildApp(false)).post('/catalog').set(ORG_HEADERS).send({})
    const data = upstreamCalls()[0].data
    expect(Object.keys(data)).toEqual(['org', 'rootOrg', 'userid'])
    expect(data.userid).toBeUndefined()
  })
})
