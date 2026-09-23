jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.get = jest.fn()
  fn.post = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { axiosRequestConfig } from '../../../src/configs/request.config'
import { networkConnectionApi } from '../../../src/protectedApi_v8/network'
import { CONSTANTS } from '../../../src/utils/env'
import { ERROR } from '../../../src/utils/message'

const mockedAxios = axios as unknown as jest.Mock & { get: jest.Mock; post: jest.Mock }

const unknown = 'Network Apis:- Failed due to unknown reason'
const SUB = 'f:realm:user-1'
const KONG = CONSTANTS.KONG_API_BASE
const HUB = CONSTANTS.NETWORK_HUB_SERVICE_BACKEND

function buildApp(withAuth = true) {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    if (withAuth) {
      req.kauth = { grant: { access_token: { content: { sub: SUB }, token: 'tok' } } }
    }
    next()
  })
  app.use(networkConnectionApi)
  return app
}

const fullHeaders = (userId: string) => ({
  Authorization: CONSTANTS.SB_API_KEY,
  rootOrg: 'igot',
  userId,
  'x-authenticated-user-token': 'tok',
})

const orgHeaders = {
  Authorization: CONSTANTS.SB_API_KEY,
  rootOrg: 'igot',
  'x-authenticated-user-token': 'tok',
}

describe.each([
  ['/connections/requested', `${KONG}/connections/profile/fetch/requested`],
  ['/connections/requests/received', `${KONG}/connections/profile/fetch/requests/received`],
  ['/connections/established', `${KONG}/connections/profile/fetch/established`],
  ['/connections/suggests', `${KONG}/connections/profile/find/suggests`],
])('networkConnectionApi GET %s', (path, upstream) => {
  it('forwards to the upstream with user headers and returns its data', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: 'ok' } })
    const res = await supertest(buildApp()).get(path).set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ result: 'ok' })
    expect(mockedAxios.get).toHaveBeenCalledTimes(1)
    expect(mockedAxios.get).toHaveBeenCalledWith(upstream, { ...axiosRequestConfig, headers: fullHeaders(SUB) })
  })

  it('prefers the wid header as userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} })
    await supertest(buildApp()).get(path).set('rootOrg', 'igot').set('wid', 'wid-1')
    expect(mockedAxios.get.mock.calls[0][1].headers).toEqual(fullHeaders('wid-1'))
  })

  it('returns 400 ERROR_NO_ORG_DATA when rootOrg is missing (checked before userId)', async () => {
    const res = await supertest(buildApp(false)).get(path)
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('returns 400 GENERAL_ERR_MSG when userId is missing', async () => {
    const res = await supertest(buildApp(false)).get(path).set('rootOrg', 'igot')
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.GENERAL_ERR_MSG)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('forwards the upstream error status and body', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
    const res = await supertest(buildApp()).get(path).set('rootOrg', 'igot')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'bad' })
  })

  it('returns 500 with the fallback body on an unknown error', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get(path).set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: unknown })
  })
})

describe('networkConnectionApi GET /connections/established/:id', () => {
  it('uses the path id as the userId header', async () => {
    mockedAxios.get.mockResolvedValue({ data: ['c1'] })
    const res = await supertest(buildApp(false)).get('/connections/established/other').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(['c1'])
    expect(mockedAxios.get).toHaveBeenCalledWith(`${KONG}/connections/profile/fetch/established`, {
      ...axiosRequestConfig,
      headers: { ...fullHeaders('other'), 'x-authenticated-user-token': undefined },
    })
  })

  it('returns 400 when rootOrg is missing', async () => {
    const res = await supertest(buildApp()).get('/connections/established/other')
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
  })

  it('forwards upstream errors, falling back to 500', async () => {
    mockedAxios.get.mockRejectedValueOnce({ response: { data: 'nope', status: 401 } })
    let res = await supertest(buildApp()).get('/connections/established/other').set('rootOrg', 'igot')
    expect(res.status).toBe(401)
    expect(res.text).toBe('nope')
    mockedAxios.get.mockRejectedValueOnce(new Error('x'))
    res = await supertest(buildApp()).get('/connections/established/other').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: unknown })
  })
})

describe.each([
  ['/add/connection', `${HUB}/connections/add`, { connectionId: 'c-2' }, { connectionId: 'c-2', userId: SUB }],
  // update deliberately swaps the ids when forwarding
  ['/update/connection', `${HUB}/connections/update`, { connectionId: 'c-2', status: 'Approved' },
    { connectionId: SUB, status: 'Approved', userId: 'c-2' }],
])('networkConnectionApi POST %s', (path, upstream, body, forwarded) => {
  it('posts the mapped body with org headers (no userId header)', async () => {
    mockedAxios.post.mockResolvedValue({ data: { done: true } })
    const res = await supertest(buildApp()).post(path).set('rootOrg', 'igot').send({ ...body, extra: 'dropped' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ done: true })
    expect(mockedAxios.post).toHaveBeenCalledTimes(1)
    expect(mockedAxios.post).toHaveBeenCalledWith(upstream, forwarded, { ...axiosRequestConfig, headers: orgHeaders })
    expect(Object.keys(mockedAxios.post.mock.calls[0][2].headers)).not.toContain('userId')
  })

  it('returns 400 ERROR_NO_ORG_DATA before validating the body', async () => {
    const res = await supertest(buildApp(false)).post(path).send({})
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
  })

  it('returns 400 when the user is missing', async () => {
    const res = await supertest(buildApp(false)).post(path).set('rootOrg', 'igot').send(body)
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.GENERAL_ERR_MSG)
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it.each(Object.keys(body))('returns 400 when %s is missing', async (field: string) => {
    const partial: Record<string, string> = { ...body }
    delete partial[field]
    const res = await supertest(buildApp()).post(path).set('rootOrg', 'igot').send(partial)
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.GENERAL_ERR_MSG)
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('forwards upstream errors, falling back to 500', async () => {
    mockedAxios.post.mockRejectedValueOnce({ response: { data: { error: 'bad' }, status: 409 } })
    let res = await supertest(buildApp()).post(path).set('rootOrg', 'igot').send(body)
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'bad' })
    mockedAxios.post.mockRejectedValueOnce(new Error('x'))
    res = await supertest(buildApp()).post(path).set('rootOrg', 'igot').send(body)
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: unknown })
  })
})

describe('networkConnectionApi POST /connections/recommended', () => {
  const path = '/connections/recommended'

  it('passes the request body through with only rootOrg/userId headers', async () => {
    mockedAxios.post.mockResolvedValue({ data: ['r1'] })
    const res = await supertest(buildApp()).post(path).set('rootOrg', 'igot').send({ size: 3 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual(['r1'])
    expect(mockedAxios.post).toHaveBeenCalledWith(`${HUB}/connections/profile/find/recommended`, { size: 3 }, {
      ...axiosRequestConfig,
      headers: { rootOrg: 'igot', userId: SUB },
    })
    expect(Object.keys(mockedAxios.post.mock.calls[0][2].headers)).toEqual(['rootOrg', 'userId'])
  })

  it('validates rootOrg then userId', async () => {
    let res = await supertest(buildApp(false)).post(path).send({})
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
    res = await supertest(buildApp(false)).post(path).set('rootOrg', 'igot').send({})
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.GENERAL_ERR_MSG)
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('forwards upstream errors, falling back to 500', async () => {
    mockedAxios.post.mockRejectedValueOnce({ response: { data: { error: 'bad' }, status: 502 } })
    let res = await supertest(buildApp()).post(path).set('rootOrg', 'igot').send({})
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'bad' })
    mockedAxios.post.mockRejectedValueOnce(new Error('x'))
    res = await supertest(buildApp()).post(path).set('rootOrg', 'igot').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: unknown })
  })
})

describe('networkConnectionApi POST /connections/recommended/userDepartment', () => {
  const path = '/connections/recommended/userDepartment'
  const recommendBody = (dept: string) => ({
    offset: 0,
    search: [{ field: 'employmentDetails.departmentName', values: [dept] }],
    size: 5,
  })

  it('looks up the department via multi-fetch and posts a recommendation search for it', async () => {
    mockedAxios.post
      .mockResolvedValueOnce({ data: [{ department_name: 'DeptA' }] })
      .mockResolvedValueOnce({ data: ['r1'] })
    const res = await supertest(buildApp()).post(path).set('rootOrg', 'igot').send({ ignored: true })
    expect(res.status).toBe(200)
    expect(res.body).toEqual(['r1'])
    expect(mockedAxios.post.mock.calls[0]).toEqual([
      `${CONSTANTS.USER_PROFILE_API_BASE}/user/multi-fetch/wid`,
      {
        conditions: { root_org: 'igot' },
        source_fields: ['wid', 'email', 'first_name', 'last_name', 'department_name'],
        values: [SUB],
      },
      { ...axiosRequestConfig, headers: { rootOrg: 'igot' } },
    ])
    expect(mockedAxios.post.mock.calls[1]).toEqual([
      `${HUB}/connections/profile/find/recommended`,
      recommendBody('DeptA'),
      { ...axiosRequestConfig, headers: { rootOrg: 'igot', userId: SUB } },
    ])
  })

  it.each([[[]], [[{}]], [''], [null]])('defaults the department to igot for %j', async (data) => {
    mockedAxios.post.mockResolvedValueOnce({ data }).mockResolvedValueOnce({ data: [] })
    await supertest(buildApp()).post(path).set('rootOrg', 'igot')
    expect(mockedAxios.post.mock.calls[1][1]).toEqual(recommendBody('igot'))
  })

  it('validates rootOrg then userId', async () => {
    let res = await supertest(buildApp(false)).post(path)
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
    res = await supertest(buildApp(false)).post(path).set('rootOrg', 'igot')
    expect(res.status).toBe(400)
    expect(res.text).toBe(ERROR.GENERAL_ERR_MSG)
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('forwards errors from the lookup and recommendation calls', async () => {
    mockedAxios.post.mockRejectedValueOnce({ response: { data: { error: 'bad' }, status: 404 } })
    let res = await supertest(buildApp()).post(path).set('rootOrg', 'igot')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'bad' })
    mockedAxios.post.mockResolvedValueOnce({ data: [] }).mockRejectedValueOnce(new Error('x'))
    res = await supertest(buildApp()).post(path).set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: unknown })
  })
})
