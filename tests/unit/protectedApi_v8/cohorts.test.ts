jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.get = jest.fn()
  fn.patch = jest.fn()
  fn.post = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { cohortsApi, getAuthorsDetails } from '../../../src/protectedApi_v8/cohorts'
import { axiosRequestConfig } from '../../../src/configs/request.config'
import { CONSTANTS } from '../../../src/utils/env'

const mockedAxios = axios as unknown as jest.Mock & { get: jest.Mock; patch: jest.Mock; post: jest.Mock }
const sbHeaders = { Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' }
const unknownErrorBody = { error: 'Failed due to unknown reason' }

// tslint:disable-next-line: no-any
function buildApp(session?: any) {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object; session?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    if (session) {
      req.session = session
    }
    next()
  })
  app.use(cohortsApi)
  return app
}

const profile = (id: string, channel: string) => ({
  channel,
  firstName: 'F' + id,
  id,
  lastName: 'L' + id,
  profileDetails: {
    personalDetails: { mobile: 42, primaryEmail: id + '@x.in' },
    professionalDetails: [{ designation: 'Director' }],
  },
  rootOrgName: 'Root ' + id,
})
const user = (id: string) => ({
  city: '', department: 'Root ' + id, desc: '', designation: 'Director', email: id + '@x.in', first_name: 'F' + id,
  last_name: 'L' + id, phone_No: 42, userLocation: '', user_id: id,
})

describe('GET /:cohortType/:contentId', () => {
  it('rejects an unknown cohort type', async () => {
    const res = await supertest(buildApp()).get('/nope/do_1').set('org', 'o').set('rootOrg', 'r')
    expect(res.status).toBe(400)
    expect(res.text).toBe('INVALID_COHORT_TYPE')
  })

  it('rejects requests without org/rootOrg headers', async () => {
    const res = await supertest(buildApp()).get('/activeusers/do_1').set('org', 'o')
    expect(res.status).toBe(400)
    expect(res.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('forwards to the cohorts service with user and org headers', async () => {
    mockedAxios.mockResolvedValue({ data: [{ id: 'u' }], status: 200 })
    const res = await supertest(buildApp({ rootOrgId: 'org-1' })).get('/activeusers/do_1').set('org', 'o').set('rootOrg', 'r')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'u' }])
    expect(mockedAxios).toHaveBeenCalledWith({
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        resourceId: 'do_1',
        rootOrg: 'r',
        userUUID: 'user-1',
        'x-authenticated-user-orgid': 'org-1',
        'x-authenticated-user-token': 'tok',
      },
      method: 'GET',
      url: `${CONSTANTS.KONG_API_BASE}/v2/resources/user/cohorts/activeusers`,
    })
  })

  it('sends an empty org id without a session', async () => {
    mockedAxios.mockResolvedValue({ data: {}, status: 204 })
    const res = await supertest(buildApp()).get('/top-performers/do_1').set('org', 'o').set('rootOrg', 'r')
    expect(res.status).toBe(204)
    expect(mockedAxios.mock.calls[0][0].headers['x-authenticated-user-orgid']).toBe('')
  })

  it('forwards upstream errors, falling back to 500 with the unknown error body', async () => {
    mockedAxios.mockRejectedValueOnce({ response: { data: { err: 1 }, status: 403 } })
    let res = await supertest(buildApp()).get('/educators/do_1').set('org', 'o').set('rootOrg', 'r')
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ err: 1 })
    mockedAxios.mockRejectedValueOnce(new Error('down'))
    res = await supertest(buildApp()).get('/educators/do_1').set('org', 'o').set('rootOrg', 'r')
    expect(res.status).toBe(500)
    expect(res.body).toEqual(unknownErrorBody)
  })

  it('resolves authors from the content hierarchy and the user registry', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { result: { content: { creatorDetails: '[{"id":"u1"}, {"id":"u2"}]' } } },
    })
    mockedAxios.post.mockResolvedValue({ data: { result: { UserProfile: [profile('u1', 'c')] } } })
    const res = await supertest(buildApp()).get('/authors/do_1').set('org', 'o').set('rootOrg', 'r')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([user('u1')])
    expect(mockedAxios.get.mock.calls[0][0]).toMatch(/\/apis\/proxies\/v8\/action\/content\/v3\/hierarchy\/do_1\?hierarchyType=detail$/)
    expect(mockedAxios.get.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer tok' })
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/search/profile`,
      { filters: { 'id.keyword': { or: ['u1', 'u2'] } } }, { ...axiosRequestConfig })
  })
})

describe('getAuthorsDetails', () => {
  it('returns false when the lookup fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    expect(await getAuthorsDetails('http://h', 'Bearer t', 'do_1')).toBe(false)
  })
})

describe('GET /:groupId', () => {
  it('rejects requests without org/rootOrg headers', async () => {
    const res = await supertest(buildApp()).get('/12').set('rootOrg', 'r')
    expect(res.status).toBe(400)
    expect(res.text).toBe('ERROR_NO_ORG_DATA')
  })

  it('fetches the group users', async () => {
    mockedAxios.get.mockResolvedValue({ data: ['a'], status: 200 })
    const res = await supertest(buildApp()).get('/12').set('org', 'o').set('rootOrg', 'r')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(['a'])
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.USER_PROFILE_API_BASE}/groups/12/users `)
  })

  it('forwards upstream errors, falling back to 500 with the unknown error body', async () => {
    mockedAxios.get.mockRejectedValueOnce({ response: { data: 'gone', status: 410 } })
    let res = await supertest(buildApp()).get('/12').set('org', 'o').set('rootOrg', 'r')
    expect(res.status).toBe(410)
    expect(res.text).toBe('gone')
    mockedAxios.get.mockRejectedValueOnce(new Error('down'))
    res = await supertest(buildApp()).get('/12').set('org', 'o').set('rootOrg', 'r')
    expect(res.status).toBe(500)
    expect(res.body).toEqual(unknownErrorBody)
  })
})

describe('GET /user/autoenrollment/:courseId', () => {
  it('forwards course, user and org headers plus the query string', async () => {
    mockedAxios.get.mockResolvedValue({ data: { enrolled: true }, status: 200 })
    const res = await supertest(buildApp({ rootOrgId: 'org-1' }))
      .get('/user/autoenrollment/do_1?batch=b1').set('wid', 'wid-1').set('rootorg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ enrolled: true })
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.KONG_API_BASE}/v1/autoenrollment`, {
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        courseId: 'do_1',
        rootOrg: 'igot',
        userUUID: 'wid-1',
        'x-authenticated-user-orgid': 'org-1',
        'x-authenticated-user-token': 'tok',
      },
      params: { batch: 'b1' },
    })
  })

  it('forwards upstream errors, falling back to 500 with the unknown error body', async () => {
    mockedAxios.get.mockRejectedValueOnce({ response: { data: { e: 1 }, status: 400 } })
    let res = await supertest(buildApp()).get('/user/autoenrollment/do_1')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ e: 1 })
    mockedAxios.get.mockRejectedValueOnce(new Error('down'))
    res = await supertest(buildApp()).get('/user/autoenrollment/do_1')
    expect(res.status).toBe(500)
    expect(res.body).toEqual(unknownErrorBody)
    expect(mockedAxios.get.mock.calls[1][1].headers['x-authenticated-user-orgid']).toBe('')
  })
})

describe('certificate routes', () => {
  const cases: Array<[string, 'get' | 'patch' | 'post', string, string, object | undefined]> = [
    ['PATCH /course/batch/cert/template/add', 'patch', '/course/batch/cert/template/add',
      `${CONSTANTS.HTTPS_HOST}/api/course/batch/cert/v1/template/add`, { template: 't' }],
    ['POST /course/batch/cert/issue', 'post', '/course/batch/cert/issue',
      `${CONSTANTS.KONG_API_BASE}/course/batch/cert/v1/issue?reIssue=true`, { batchId: 'b' }],
    ['GET /course/batch/cert/download/:certId', 'get', '/course/batch/cert/download/cert-1',
      `${CONSTANTS.HTTPS_HOST}/api/certreg/v2/certs/download/cert-1`, undefined],
  ]

  describe.each(cases)('%s', (_label, method, path, url, body) => {
    const send = () => {
      const req = supertest(buildApp())[method](path)
      return body ? req.send(body) : req
    }
    const config = { ...axiosRequestConfig, headers: sbHeaders }
    const expectedArgs = body ? [url, body, config] : [url, config]

    it('forwards to the certificate service and returns its response', async () => {
      mockedAxios[method].mockResolvedValue({ data: { done: true }, status: 201 })
      const res = await send()
      expect(res.status).toBe(201)
      expect(res.body).toEqual({ done: true })
      expect(mockedAxios[method]).toHaveBeenCalledWith(...expectedArgs)
    })

    it('forwards upstream errors, falling back to 500 with the unknown error body', async () => {
      mockedAxios[method].mockRejectedValueOnce({ response: { data: { e: 2 }, status: 404 } })
      let res = await send()
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ e: 2 })
      mockedAxios[method].mockRejectedValueOnce(new Error('down'))
      res = await send()
      expect(res.status).toBe(500)
      expect(res.body).toEqual(unknownErrorBody)
    })
  })
})

describe('GET /course/getUsersForBatch/:batchId/:deptName?', () => {
  const participants = (list: string[]) => ({ data: { result: { batch: { participants: list } } }, status: 200 })

  it('returns participants filtered by department', async () => {
    mockedAxios.post.mockResolvedValue(participants(['u1', 'u2']))
    mockedAxios.mockResolvedValue({
      data: { result: { response: { content: [profile('u1', 'dept-a'), profile('u2', 'dept-b')], count: 2 } } },
    })
    const res = await supertest(buildApp()).get('/course/getUsersForBatch/b1/dept-a')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([user('u1')])
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.KONG_API_BASE}/course/v1/batch/participants/list`,
      { request: { batch: { active: true, batchId: 'b1' } } }, { ...axiosRequestConfig, headers: sbHeaders })
    expect(mockedAxios).toHaveBeenCalledWith({
      ...axiosRequestConfig,
      data: { request: { filters: { userId: ['u1', 'u2'] } } },
      headers: sbHeaders,
      method: 'POST',
      url: `${CONSTANTS.KONG_API_BASE}/user/v1/search`,
    })
  })

  it('returns every participant without a department', async () => {
    mockedAxios.post.mockResolvedValue(participants(['u1', 'u2']))
    mockedAxios.mockResolvedValue({ data: { result: { response: { content: [profile('u1', 'a'), profile('u2', 'b')], count: 2 } } } })
    const res = await supertest(buildApp()).get('/course/getUsersForBatch/b1')
    expect(res.body).toEqual([user('u1'), user('u2')])
  })

  it('returns an empty list when the search finds nobody or there are no participants', async () => {
    mockedAxios.post.mockResolvedValue(participants(['u1']))
    mockedAxios.mockResolvedValue({ data: { result: { response: { content: [], count: 0 } } } })
    let res = await supertest(buildApp()).get('/course/getUsersForBatch/b1')
    expect(res.body).toEqual([])
    mockedAxios.mockClear()
    mockedAxios.post.mockResolvedValue(participants([]))
    res = await supertest(buildApp()).get('/course/getUsersForBatch/b1')
    expect(res.body).toEqual([])
    expect(mockedAxios).not.toHaveBeenCalled()
  })

  it('forwards upstream errors, falling back to 500 with the unknown error body', async () => {
    mockedAxios.post.mockRejectedValueOnce({ response: { data: { e: 3 }, status: 502 } })
    let res = await supertest(buildApp()).get('/course/getUsersForBatch/b1')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ e: 3 })
    mockedAxios.post.mockResolvedValueOnce({ data: { result: {} }, status: 200 })
    res = await supertest(buildApp()).get('/course/getUsersForBatch/b1')
    expect(res.status).toBe(500)
    expect(res.body).toEqual(unknownErrorBody)
  })
})
