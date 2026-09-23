jest.mock('axios')

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { myAnalyticsApi } from '../../../../src/protectedApi_v8/user/myAnalytics'
import { CONSTANTS } from '../../../../src/utils/env'

const mockedAxios = axios as jest.Mocked<typeof axios>

const LA1 = `${CONSTANTS.HTTPS_HOST}LA1/api`
const VALIDATOR_URL = `${CONSTANTS.HTTPS_HOST}/apis/protected/v8/user/validate`
const GENERAL_ERROR = { error: 'Failed due to unknown reason' }

const EXPECTED_HEADERS = {
  Authorization: 'Bearer tok',
  org: 'org-1',
  rootOrg: 'root-1',
  validator_url: VALIDATOR_URL,
  wid: 'user-1',
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(myAnalyticsApi)
  return app
}

type HttpMethod = 'get' | 'post' | 'delete'

function request(method: 'get' | 'post', path: string) {
  return supertest(buildApp())[method](path)
    .set('Authorization', 'Bearer tok')
    .set('org', 'org-1')
    .set('rootOrg', 'root-1')
}

interface IPassThroughCase {
  // Path requested on the proxy, with query string.
  path: string
  // Same path without any query string, to check which params are forwarded.
  barePath: string
  method: 'get' | 'post'
  upstreamMethod: HttpMethod
  // Expected upstream URL for `path`.
  url: string
  // Expected upstream URL for `barePath`.
  bareUrl: string
}

const passThroughCases: IPassThroughCase[] = [
  {
    barePath: '/assessment/course',
    bareUrl: `${LA1}/assessment?contentType=course`,
    method: 'get',
    path: '/assessment/course?startDate=s&endDate=e&isCompleted=true&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/assessment?contentType=course&endDate=e&isCompleted=true&startDate=s`,
  },
  {
    barePath: '/timespent/course',
    bareUrl: `${LA1}/timespent?contentType=course`,
    method: 'get',
    path: '/timespent/course?startDate=s&endDate=e&isCompleted=true&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/timespent?contentType=course&endDate=e&isCompleted=true&startDate=s`,
  },
  {
    barePath: '/nsoArtifactsAndCollaborators/course',
    bareUrl: `${LA1}/nsoArtifactsAndCollaborators?contentType=course`,
    method: 'get',
    path: '/nsoArtifactsAndCollaborators/course?startDate=s&endDate=e&isCompleted=true&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/nsoArtifactsAndCollaborators?contentType=course&endDate=e&isCompleted=true&startDate=s`,
  },
  {
    barePath: '/skills',
    bareUrl: `${LA1}/skills`,
    method: 'get',
    path: '/skills?extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/skills`,
  },
  {
    barePath: '/myskills',
    bareUrl: `${LA1}/myskills`,
    method: 'get',
    path: '/myskills?extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/myskills`,
  },
  {
    barePath: '/recommendedSkills',
    bareUrl: `${LA1}/recommendedSkills`,
    method: 'get',
    path: '/recommendedSkills?extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/recommendedSkills`,
  },
  {
    barePath: '/allSkills',
    bareUrl: `${LA1}/allSkills?`,
    method: 'get',
    path: '/allSkills?searchText=a&horizon=h&category=c&pageNo=2&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/allSkills?category=c&horizon=h&pageNo=2&searchText=a`,
  },
  {
    barePath: '/isAdmin',
    bareUrl: `${LA1}/isAdmin`,
    method: 'get',
    path: '/isAdmin?extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/isAdmin`,
  },
  {
    barePath: '/role/get',
    bareUrl: `${LA1}/role/get`,
    method: 'get',
    path: '/role/get?extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/role/get`,
  },
  {
    barePath: '/skillquotient',
    bareUrl: `${LA1}/skillquotient?`,
    method: 'get',
    path: '/skillquotient?skill_id=5&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/skillquotient?skill_id=5`,
  },
  {
    barePath: '/rolequotient',
    bareUrl: `${LA1}/rolequotient?`,
    method: 'get',
    path: '/rolequotient?role_id=6&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/rolequotient?role_id=6`,
  },
  {
    barePath: '/skills-role/r1',
    bareUrl: `${LA1}/nso/getCourseAndProgress?role_id=r1`,
    method: 'get',
    path: '/skills-role/r1?extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/nso/getCourseAndProgress?role_id=r1`,
  },
  {
    barePath: '/role/getExisting',
    bareUrl: `${LA1}/role/getExisting`,
    method: 'get',
    path: '/role/getExisting?extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/role/getExisting`,
  },
  {
    barePath: '/role/add',
    bareUrl: `${LA1}/role/add`,
    method: 'post',
    path: '/role/add?extra=x',
    upstreamMethod: 'post',
    url: `${LA1}/role/add`,
  },
  {
    barePath: '/skills/add',
    bareUrl: `${LA1}/skills/add`,
    method: 'post',
    path: '/skills/add?extra=x',
    upstreamMethod: 'post',
    url: `${LA1}/skills/add`,
  },
  {
    barePath: '/role/shareRole',
    bareUrl: `${LA1}/role/shareRole`,
    method: 'post',
    path: '/role/shareRole?extra=x',
    upstreamMethod: 'post',
    url: `${LA1}/role/shareRole`,
  },
  {
    barePath: '/skill/search',
    bareUrl: `${LA1}/skill/search?`,
    method: 'get',
    path: '/skill/search?search_text=java&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/skill/search?search_text=java`,
  },
  {
    barePath: '/role/delete',
    bareUrl: `${LA1}/role/delete?`,
    method: 'get',
    path: '/role/delete?role_id=7&extra=x',
    upstreamMethod: 'delete',
    url: `${LA1}/role/delete?role_id=7`,
  },
  {
    barePath: '/role/update',
    bareUrl: `${LA1}/role/update`,
    method: 'post',
    path: '/role/update?extra=x',
    upstreamMethod: 'post',
    url: `${LA1}/role/update`,
  },
  {
    barePath: '/isApprover',
    bareUrl: `${LA1}/isApprover`,
    method: 'get',
    path: '/isApprover?extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/isApprover`,
  },
  {
    barePath: '/skillData',
    bareUrl: `${LA1}/skillData?`,
    method: 'get',
    path: '/skillData?skill_id=8&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/skillData?skill_id=8`,
  },
  {
    barePath: '/search',
    bareUrl: `${LA1}/search?`,
    method: 'get',
    path: '/search?search_text=q&type=skill&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/search?search_text=q&type=skill`,
  },
  {
    barePath: '/projectEndorsement/getList',
    bareUrl: `${LA1}/projectEndorsement/getList?`,
    method: 'get',
    path: '/projectEndorsement/getList?request_type=pending&extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/projectEndorsement/getList?request_type=pending`,
  },
  {
    barePath: '/projectEndorsement/get',
    bareUrl: `${LA1}/projectEndorsement/get`,
    method: 'get',
    path: '/projectEndorsement/get?extra=x',
    upstreamMethod: 'get',
    url: `${LA1}/projectEndorsement/get`,
  },
  {
    barePath: '/projectEndorsement/endorseRequest',
    bareUrl: `${LA1}/projectEndorsement/endorseRequest?`,
    method: 'post',
    path: '/projectEndorsement/endorseRequest?endorse_id=9&extra=x',
    upstreamMethod: 'post',
    url: `${LA1}/projectEndorsement/endorseRequest?endorse_id=9`,
  },
  {
    barePath: '/projectEndorsement/add',
    bareUrl: `${LA1}/projectEndorsement/add`,
    method: 'post',
    path: '/projectEndorsement/add?extra=x',
    upstreamMethod: 'post',
    url: `${LA1}/projectEndorsement/add`,
  },
]

const allUpstreamMethods: HttpMethod[] = ['get', 'post', 'delete']

function expectOnlyUpstreamCall(upstreamMethod: HttpMethod) {
  allUpstreamMethods
    .filter((m) => m !== upstreamMethod)
    .forEach((m) => expect(mockedAxios[m]).not.toHaveBeenCalled())
  expect(mockedAxios[upstreamMethod]).toHaveBeenCalledTimes(1)
}

function expectUpstreamCall(
  upstreamMethod: HttpMethod,
  url: string,
  // tslint:disable-next-line: no-any
  body?: any,
  headers = EXPECTED_HEADERS
) {
  expectOnlyUpstreamCall(upstreamMethod)
  if (upstreamMethod === 'post') {
    expect(mockedAxios.post).toHaveBeenCalledWith(url, body, { headers })
  } else {
    expect(mockedAxios[upstreamMethod]).toHaveBeenCalledWith(url, { headers })
  }
}

beforeEach(() => {
  allUpstreamMethods.forEach((m) => mockedAxios[m].mockReset())
})

describe.each(passThroughCases)('$method $barePath', (c) => {
  const body = { some: 'payload' }

  it('forwards to the upstream and passes status and data back', async () => {
    mockedAxios[c.upstreamMethod].mockResolvedValue({ data: { ok: c.barePath }, status: 201 })
    const res = await request(c.method, c.path).send(body)
    expect(res.status).toBe(201)
    expect(res.body).toEqual({ ok: c.barePath })
    expectUpstreamCall(c.upstreamMethod, c.url, body)
  })

  it('builds the upstream URL when no query params are given', async () => {
    mockedAxios[c.upstreamMethod].mockResolvedValue({ data: [], status: 200 })
    const res = await request(c.method, c.barePath)
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
    expectUpstreamCall(c.upstreamMethod, c.bareUrl, {})
  })

  it('forwards the upstream error status and data', async () => {
    mockedAxios[c.upstreamMethod].mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
    const res = await request(c.method, c.path)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'bad' })
  })

  it('returns 500 with the general error when the upstream error has no response', async () => {
    mockedAxios[c.upstreamMethod].mockRejectedValue(new Error('down'))
    const res = await request(c.method, c.path)
    expect(res.status).toBe(500)
    expect(res.body).toEqual(GENERAL_ERROR)
  })
})

describe('user id resolution', () => {
  it('uses the wid header in preference to the token subject', async () => {
    mockedAxios.get.mockResolvedValue({ data: {}, status: 200 })
    await request('get', '/isAdmin').set('wid', 'header-user')
    expectUpstreamCall('get', `${LA1}/isAdmin`, undefined, { ...EXPECTED_HEADERS, wid: 'header-user' })
  })

  it('sends undefined for headers that are not present on the request', async () => {
    mockedAxios.get.mockResolvedValue({ data: {}, status: 200 })
    await supertest(buildApp()).get('/isAdmin')
    expect(mockedAxios.get).toHaveBeenCalledWith(`${LA1}/isAdmin`, {
      headers: {
        Authorization: undefined,
        org: undefined,
        rootOrg: undefined,
        validator_url: VALIDATOR_URL,
        wid: 'user-1',
      },
    })
  })

  it('GET /myskills prefers the wid query param over the header and token', async () => {
    mockedAxios.get.mockResolvedValue({ data: [], status: 200 })
    await request('get', '/myskills?wid=query-user').set('wid', 'header-user')
    expectUpstreamCall('get', `${LA1}/myskills`, undefined, { ...EXPECTED_HEADERS, wid: 'query-user' })
  })

  it('GET /skills ignores the wid query param', async () => {
    mockedAxios.get.mockResolvedValue({ data: [], status: 200 })
    await request('get', '/skills?wid=query-user')
    expectUpstreamCall('get', `${LA1}/skills`)
  })
})

describe.each([
  { path: '/assessments', sourceKey: 'assessments', upstream: 'v1/assessment' },
  { path: '/certification', sourceKey: 'certifications', upstream: 'v1/certification' },
])('GET $path', ({ path, sourceKey, upstream }) => {
  it('forwards the date range and renames the list to achievements', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { [sourceKey]: [{ id: 'a1' }], other: 1 },
      status: 202,
    })
    const res = await request('get', `${path}?startDate=s&endDate=e&isCompleted=true`)
    expect(res.status).toBe(202)
    expect(res.body).toEqual({ achievements: [{ id: 'a1' }], other: 1 })
    expectUpstreamCall('get', `${LA1}/${upstream}?endDate=e&startDate=s`)
  })

  it('defaults achievements to an empty list', async () => {
    mockedAxios.get.mockResolvedValue({ data: { other: 1 }, status: 200 })
    const res = await request('get', path)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ achievements: [], other: 1 })
    expectUpstreamCall('get', `${LA1}/${upstream}?`)
  })

  it('forwards the upstream error status and data', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 403 } })
    const res = await request('get', path)
    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: 'bad' })
  })

  it('returns 500 with the general error when the upstream error has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await request('get', path)
    expect(res.status).toBe(500)
    expect(res.body).toEqual(GENERAL_ERROR)
  })
})

describe('GET /userProgress/:contentType', () => {
  it('returns the upstream user progress with status 200', async () => {
    mockedAxios.get.mockResolvedValue({ data: { learning_history: [1] }, status: 201 })
    const res = await request('get', '/userProgress/course?startDate=s&endDate=e&isCompleted=true&x=1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ learning_history: [1] })
    expectUpstreamCall('get', `${LA1}/userprogress?contentType=course&endDate=e&isCompleted=true&startDate=s`)
  })

  it('forwards the upstream error status and data', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
    const res = await request('get', '/userProgress/course')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'bad' })
  })

  it('returns 500 with the general error when the upstream error has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await request('get', '/userProgress/course')
    expect(res.status).toBe(500)
    expect(res.body).toEqual(GENERAL_ERROR)
  })
})

describe('GET /:contentType/learning-history', () => {
  it('returns the learning history fields of the user progress', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { learning_history: [{ id: 'c1' }], learning_history_progress_range: { a: 1 }, other: 2 },
      status: 201,
    })
    const res = await request('get', '/course/learning-history?startDate=s')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ learningHistory: [{ id: 'c1' }], learningHistoryProgress: { a: 1 } })
    expectUpstreamCall('get', `${LA1}/userprogress?contentType=course&startDate=s`)
  })

  it('returns 500 with the general error when the upstream returns no data', async () => {
    mockedAxios.get.mockResolvedValue({ data: undefined, status: 200 })
    const res = await request('get', '/course/learning-history')
    expect(res.status).toBe(500)
    expect(res.body).toEqual(GENERAL_ERROR)
  })

  it('forwards the upstream error status and data', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
    const res = await request('get', '/course/learning-history')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'bad' })
  })
})
