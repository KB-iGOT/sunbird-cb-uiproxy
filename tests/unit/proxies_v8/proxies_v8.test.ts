jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.get = jest.fn()
  fn.post = jest.fn()
  return fn
})

// Every proxy creator is replaced by a tagged router that echoes which creator/target handled the request
jest.mock('../../../src/utils/proxyCreator', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const make = (name: string) => (route: unknown, ...args: unknown[]) => {
    // tslint:disable-next-line: no-any
    const router: any = route || expressLib.Router()
    router.__proxy = { args, name }
    // tslint:disable-next-line: no-any
    router.use((req: any, res: any) => res.json({ args, name, url: req.originalUrl }))
    return router
  }
  return {
    ilpProxyCreatorRoute: make('ilpProxyCreatorRoute'),
    proxyAssessmentRead: make('proxyAssessmentRead'),
    proxyAssessmentReadV2: make('proxyAssessmentReadV2'),
    proxyAssessmentReadV7: make('proxyAssessmentReadV7'),
    proxyContent: make('proxyContent'),
    proxyContentLearnerVM: make('proxyContentLearnerVM'),
    proxyCreatorForms: make('proxyCreatorForms'),
    proxyCreatorKnowledge: make('proxyCreatorKnowledge'),
    proxyCreatorLearner: make('proxyCreatorLearner'),
    proxyCreatorQML: make('proxyCreatorQML'),
    proxyCreatorRoute: make('proxyCreatorRoute'),
    proxyCreatorSunbird: make('proxyCreatorSunbird'),
    proxyCreatorSunbirdSearch: make('proxyCreatorSunbirdSearch'),
    proxyCreatorToAppentUserId: make('proxyCreatorToAppentUserId'),
    proxyQuestionRead: make('proxyQuestionRead'),
    scormProxyCreatorRoute: make('scormProxyCreatorRoute'),
  }
})

function mockMarker(name: string) {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.__marker = name
  return router
}
jest.mock('../../../src/proxies_v8/chatBotGenericAPIIntegration', () => ({
  chatBotGenericAPIIntegration: mockMarker('chatBotGenericAPIIntegration'),
}))
jest.mock('../../../src/proxies_v8/chatBotIntegration', () => ({ chatBotIntegrationAPI: mockMarker('chatBotIntegrationAPI') }))
jest.mock('../../../src/proxies_v8/contentTranscodeAPIIntegration', () => ({
  contentTranscodeAPIIntegration: mockMarker('contentTranscodeAPIIntegration'),
}))
jest.mock('../../../src/proxies_v8/frameworks', () => ({ frameworksApi: mockMarker('frameworksApi') }))
jest.mock('../../../src/proxies_v8/jwtUserTokenHelper', () => ({ jwtUserTokenHelper: mockMarker('jwtUserTokenHelper') }))
jest.mock('../../../src/proxies_v8/lookerIntegration', () => ({ lookerDashboard: mockMarker('lookerDashboard') }))
// Upstream bases are replaced by stable placeholders so the route table snapshot is environment independent
jest.mock('../../../src/utils/env', () => {
  const actual = jest.requireActual('../../../src/utils/env')
  const keys = ['ANALYTICS_TIMEOUT', 'APP_ANALYTICS', 'CONTENT_API_BASE', 'CONTENT_SERVICE_API_BASE', 'DASHBOARD_API_BASE',
    'GAMIFICATION_API_BASE', 'ILP_FP_PROXY', 'KNOWLEDGE_MW_API_BASE', 'KONG_API_BASE', 'SB_API_KEY', 'SCORM_PLAYER_BASE',
    'STATIC_ILP_PROXY', 'VM_LEARNING_SERVICE_URL', 'WEB_HOST_PROXY']
  const overrides: { [key: string]: string } = {}
  keys.forEach((key) => overrides[key] = `{${key}}`)
  return { ...actual, CONSTANTS: { ...actual.CONSTANTS, ...overrides } }
})
jest.mock('../../../src/authz', () => ({ allocationService: { readByUserIdCourseId: jest.fn() } }))

// Fake form-data: records appended fields and submit options, and lets each test script the upstream response
// tslint:disable-next-line: no-any
const mockForm: { instances: any[]; respond: (cb: any) => void; timeout: jest.Mock } = {
  instances: [],
  respond: () => undefined,
  timeout: jest.fn(),
}
jest.mock('form-data', () => jest.fn().mockImplementation(() => {
  // tslint:disable-next-line: no-any
  const inst: any = { appends: [], options: undefined }
  inst.append = (...args: unknown[]) => inst.appends.push(args)
  // tslint:disable-next-line: no-any
  inst.submit = (options: any, cb: any) => {
    inst.options = options
    mockForm.respond(cb)
    return { setTimeout: mockForm.timeout }
  }
  mockForm.instances.push(inst)
  return inst
}))

import axios from 'axios'
import { EventEmitter } from 'events'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { proxiesV8 } from '../../../src/proxies_v8/proxies_v8'
import { CONSTANTS } from '../../../src/utils/env'

const mockedAxios = axios as unknown as jest.Mock & { get: jest.Mock; post: jest.Mock }

// tslint:disable-next-line: no-any
function buildApp(opts: { files?: any; session?: any } = {}) {
  const app = express()
  app.use(express.json())
  // tslint:disable-next-line: no-any
  app.use((req: Request & { kauth?: object; session?: any; files?: any }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'f:abc:user-1' }, token: 'tok' } } }
    if (opts.session) {
      req.session = opts.session
    }
    if (opts.files) {
      req.files = opts.files
    }
    next()
  })
  app.use('/proxies/v8', proxiesV8)
  return app
}

const file = (name = 'a.csv') => ({ data: Buffer.from('x,y'), mimetype: 'text/csv', name })

// tslint:disable-next-line: no-any
function upstream(statusCode: number, body: string | Buffer, headers: any = {}, chunked = false) {
  // tslint:disable-next-line: no-any
  mockForm.respond = (cb: any) => {
    // tslint:disable-next-line: no-any
    const response: any = new EventEmitter()
    response.statusCode = statusCode
    response.headers = headers
    cb(null, response)
    process.nextTick(() => {
      const buf = Buffer.from(body)
      if (chunked) {
        response.emit('data', buf.slice(0, 3))
        response.emit('data', buf.slice(3))
      } else {
        response.emit('data', buf)
      }
      response.emit('end')
    })
  }
}

function upstreamError(error: unknown) {
  // tslint:disable-next-line: no-any
  mockForm.respond = (cb: any) => cb(error, undefined)
}

// Reads the response body as raw text regardless of content type
// tslint:disable-next-line: no-any
function rawText(res: any, cb: (err: Error | null, body: string) => void) {
  let text = ''
  res.on('data', (chunk: Buffer) => text += chunk.toString())
  res.on('end', () => cb(null, text))
}

function lastForm() {
  return mockForm.instances[mockForm.instances.length - 1]
}

beforeEach(() => {
  mockForm.instances = []
  mockForm.respond = () => undefined
})

describe('proxiesV8 route table', () => {
  it('registers every route and proxy mount in the same order with the same targets', () => {
    // tslint:disable-next-line: no-any
    const table = (proxiesV8 as any).stack.map((layer: any) => {
      if (layer.route) {
        return `${Object.keys(layer.route.methods).join(',')} ${JSON.stringify(layer.route.path)}`
      }
      const proxy = layer.handle.__proxy
      const target = proxy ? `${proxy.name}(${proxy.args.join(', ')})` : (layer.handle.__marker || layer.name)
      return `use ${layer.regexp} -> ${target}`
    })
    expect(table).toMatchSnapshot()
  })

  it.each([
    ['/content/v2/discard', 'proxyCreatorKnowledge', CONSTANTS.KONG_API_BASE],
    ['/content/v2/read/x', 'proxyCreatorSunbird', CONSTANTS.KONG_API_BASE],
    ['/contentsearch/x', 'proxyCreatorSunbirdSearch', `${CONSTANTS.KONG_API_BASE}/content/v1/search`],
    ['/sunbirdigot/v4/x', 'proxyCreatorSunbirdSearch', `${CONSTANTS.KONG_API_BASE}/composite/v4/search`],
    ['/sunbirdigot/x', 'proxyCreatorSunbirdSearch', `${CONSTANTS.KONG_API_BASE}/composite/v1/search`],
    ['/content-progres/ngo/x', 'proxyCreatorSunbirdSearch', `${CONSTANTS.KONG_API_BASE}/course/v1/content/state/update/ngo`],
    ['/login/entry', 'proxyCreatorSunbirdSearch', `${CONSTANTS.KONG_API_BASE}/v1/user/login`],
    ['/karmapoints/read', 'proxyCreatorSunbirdSearch', `${CONSTANTS.KONG_API_BASE}/karmapoints/read`],
    ['/halloffame/top/learners/x', 'proxyCreatorSunbird', CONSTANTS.KONG_API_BASE],
    ['/ai/assessments/v1/read', 'proxyCreatorSunbird', CONSTANTS.KONG_API_BASE],
    ['/action/content/v3/read/x', 'proxyCreatorKnowledge', CONSTANTS.KNOWLEDGE_MW_API_BASE],
    ['/wat/dashboard/x', 'proxyCreatorSunbird', CONSTANTS.DASHBOARD_API_BASE],
    ['/org/v1/read', 'proxyCreatorSunbird', CONSTANTS.KONG_API_BASE],
    ['/national/learning/week/insights', 'proxyCreatorSunbirdSearch', `${CONSTANTS.KONG_API_BASE}/national/learning/week/insights`],
    ['/composite/v4/bp/search', 'proxyCreatorSunbirdSearch', `${CONSTANTS.KONG_API_BASE}/composite/v4/bp/search`],
    ['/ca/x', 'proxyCreatorSunbird', CONSTANTS.KONG_API_BASE],
  ])('routes %s to %s', async (path, name, target) => {
    const res = await supertest(buildApp()).get(`/proxies/v8${path}`)
    expect(res.status).toBe(200)
    expect(res.body.name).toBe(name)
    expect(res.body.args[0]).toBe(`${target}`)
  })
})

describe('POST /upload/*', () => {
  it('responds with the file-not-found message when no file is attached', async () => {
    const res = await supertest(buildApp()).post('/proxies/v8/upload/action/content/v3/upload/do_1')
    expect(res.status).toBe(200)
    expect(res.text).toBe('File not found in the request')
  })

  it('submits the file to content-service and returns the parsed JSON body', async () => {
    upstream(200, '{"ok":true}', {}, true)
    const res = await supertest(buildApp({ files: { data: file() } }))
      .post('/proxies/v8/upload/action/content/v3/upload/do_1').set('wid', 'wid-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    const form = lastForm()
    expect(form.appends).toEqual([['file', Buffer.from('x,y'), { contentType: 'text/csv', filename: 'a.csv' }]])
    expect(form.options).toEqual({
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        org: 'dopt',
        rootorg: 'igot',
        'x-authenticated-user-token': 'tok',
        'x-authenticated-userid': 'wid-1',
      },
      host: 'content-service',
      path: '/content/v3/upload/do_1',
      port: 9000,
    })
  })

  it('passes a non-JSON success body through as text', async () => {
    upstream(201, 'plain')
    const res = await supertest(buildApp({ files: { data: file() } })).post('/proxies/v8/upload/action/x')
    expect(res.status).toBe(201)
    expect(res.text).toBe('plain')
  })

  it('passes upstream error status and body through', async () => {
    upstream(400, '{"bad":1}')
    const res = await supertest(buildApp({ files: { data: file() } })).post('/proxies/v8/upload/action/x')
    expect(res.status).toBe(400)
    expect(res.text).toBe('{"bad":1}')
  })

  it('responds 502 when the submit itself fails', async () => {
    upstreamError(new Error('refused'))
    const res = await supertest(buildApp({ files: { data: file() } })).post('/proxies/v8/upload/action/x')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Request failed', message: 'Error: refused' })
  })
})

describe('POST /private/upload/*', () => {
  it('responds with the file-not-found message when no file is attached', async () => {
    const res = await supertest(buildApp()).post('/proxies/v8/private/upload/content/v3/upload/do_1')
    expect(res.status).toBe(200)
    expect(res.text).toBe('File not found in the request')
  })

  it('submits the file to content-service and returns the parsed JSON body', async () => {
    upstream(200, '{"ok":true}')
    const res = await supertest(buildApp({ files: { data: file() } })).post('/proxies/v8/private/upload/content/v3/upload/do_1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    const form = lastForm()
    expect(form.appends).toEqual([['file', Buffer.from('x,y'), { contentType: 'text/csv', filename: 'a.csv' }]])
    expect(form.options).toEqual({
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        org: 'dopt',
        rootorg: 'igot',
        'x-authenticated-user-token': 'tok',
        'x-authenticated-userid': 'f:abc:user-1',
      },
      host: 'content-service',
      path: '/content/v3/upload/do_1',
      port: 9000,
    })
  })

  it('sends a non-success body as text with status 200', async () => {
    upstream(400, 'nope')
    const res = await supertest(buildApp({ files: { data: file() } })).post('/proxies/v8/private/upload/x')
    expect(res.status).toBe(200)
    expect(res.text).toBe('nope')
  })

  it('responds 502 when the submit itself fails', async () => {
    upstreamError('boom')
    const res = await supertest(buildApp({ files: { data: file() } })).post('/proxies/v8/private/upload/x')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Upload failed', message: 'boom' })
  })
})

describe('POST /ai/assessments/v1/generate', () => {
  it('forwards body fields and single/array files to kong with session headers and a 5 minute timeout', async () => {
    upstream(200, '{"generated":true}')
    const files = { docs: [file('1.pdf'), file('2.pdf')], extra: file('3.pdf') }
    const res = await supertest(buildApp({ files, session: { channel: 'My Org', rootOrgId: 'org-1' } }))
      .post('/proxies/v8/ai/assessments/v1/generate?x=1').send({ count: '5', topic: 'maths' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ generated: true })
    const form = lastForm()
    expect(form.appends).toEqual([
      ['count', '5'],
      ['topic', 'maths'],
      ['docs', Buffer.from('x,y'), { contentType: 'text/csv', filename: '1.pdf' }],
      ['docs', Buffer.from('x,y'), { contentType: 'text/csv', filename: '2.pdf' }],
      ['extra', Buffer.from('x,y'), { contentType: 'text/csv', filename: '3.pdf' }],
    ])
    expect(form.options).toEqual({
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'x-authenticated-user-channel': 'My%20Org',
        'x-authenticated-user-orgid': 'org-1',
        'x-authenticated-user-orgname': 'My%20Org',
        'x-authenticated-user-token': 'tok',
        'x-authenticated-userid': 'f:abc:user-1',
      },
      host: 'kong',
      path: '/ai/assessments/v1/generate?x=1',
      port: 8000,
    })
    expect(mockForm.timeout).toHaveBeenCalledWith(300000)
  })

  it('defaults org headers to empty strings without a session', async () => {
    upstream(500, 'err')
    const res = await supertest(buildApp()).post('/proxies/v8/ai/assessments/v1/generate')
    expect(res.status).toBe(500)
    expect(res.text).toBe('err')
    expect(lastForm().appends).toEqual([])
    expect(lastForm().options.headers).toEqual(expect.objectContaining({
      'x-authenticated-user-channel': '',
      'x-authenticated-user-orgid': '',
      'x-authenticated-user-orgname': '',
    }))
  })
})

describe('POST bulk upload routes', () => {
  const session = { channel: 'My Org', rootOrgId: 'org-1' }
  const expectedHeaders = {
    Authorization: CONSTANTS.SB_API_KEY,
    'x-authenticated-user-channel': 'My%20Org',
    'x-authenticated-user-orgid': 'org-1',
    'x-authenticated-user-orgname': 'My%20Org',
    'x-authenticated-user-token': 'tok',
    'x-authenticated-userid': 'f:abc:user-1',
  }

  it.each(['data', 'file'])('forwards req.files.%s with metadata to kong and returns parsed JSON', async (field) => {
    upstream(200, '{"ok":1}', {}, true)
    const res = await supertest(buildApp({ files: { [field]: file() }, session }))
      .post('/proxies/v8/user/v1/bulkupload').send({ metadata: 'meta' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: 1 })
    const form = lastForm()
    expect(form.appends).toEqual([
      ['file', Buffer.from('x,y'), { contentType: 'text/csv', filename: 'a.csv' }],
      ['metadata', 'meta'],
    ])
    expect(form.options).toEqual({ headers: expectedHeaders, host: 'kong', path: '/user/v1/bulkupload', port: 8000 })
  })

  it.each(['data', 'file'])('adds targetorgid from the body or header (req.files.%s)', async (field) => {
    upstream(201, '{}')
    await supertest(buildApp({ files: { [field]: file() }, session }))
      .post('/proxies/v8/storage/profilePhotoUpload/abc').send({ targetorgid: 'body-org' }).set('targetorgid', 'hdr-org')
    expect(lastForm().options.headers.targetorgid).toBe('body-org')
    await supertest(buildApp({ files: { [field]: file() }, session }))
      .post('/proxies/v8/storage/profilePhotoUpload/abc').set('targetorgid', 'hdr-org')
    expect(lastForm().options.headers.targetorgid).toBe('hdr-org')
    expect(lastForm().appends).toHaveLength(1)
  })

  it.each(['data', 'file'])('defaults session headers and token to empty strings (req.files.%s)', async (field) => {
    upstream(200, '{}')
    const app = express()
    // tslint:disable-next-line: no-any
    app.use((req: any, _res: Response, next: NextFunction) => {
      req.files = { [field]: file() }
      next()
    })
    app.use('/proxies/v8', proxiesV8)
    await supertest(app).post('/proxies/v8/user/v3/bulkupload').set('wid', 'w')
    expect(lastForm().options.headers).toEqual({
      Authorization: CONSTANTS.SB_API_KEY,
      'x-authenticated-user-channel': '',
      'x-authenticated-user-orgid': '',
      'x-authenticated-user-orgname': '',
      'x-authenticated-user-token': '',
      'x-authenticated-userid': 'w',
    })
  })

  it.each(['data', 'file'])('returns csv responses as an attachment (req.files.%s)', async (field) => {
    upstream(406, 'a,b\n1,2', { 'content-type': 'text/csv' })
    const res = await supertest(buildApp({ files: { [field]: file() }, session }))
      .post('/proxies/v8/user/v2/bulkupload').parse(rawText)
    expect(res.status).toBe(406)
    expect(res.headers['content-type']).toContain('text/csv')
    expect(res.headers['content-disposition']).toBe('attachment; filename="report.csv"')
    expect(res.body).toBe('a,b\n1,2')
  })

  it.each(['data', 'file'])('returns invalid JSON success bodies as application/json text (req.files.%s)', async (field) => {
    upstream(200, 'not-json')
    const res = await supertest(buildApp({ files: { [field]: file() }, session }))
      .post('/proxies/v8/peersurvey/upload').parse(rawText)
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('application/json')
    expect(res.body).toBe('not-json')
  })

  it.each(['data', 'file'])('passes non-success status and body through (req.files.%s)', async (field) => {
    upstream(422, 'bad rows')
    const res = await supertest(buildApp({ files: { [field]: file() }, session })).post('/proxies/v8/user/nongovt/v1/bulkupload')
    expect(res.status).toBe(422)
    expect(res.text).toBe('bad rows')
  })

  it('responds 500 when no file is attached', async () => {
    const res = await supertest(buildApp({ session })).post('/proxies/v8/user/v1/bulkupload')
    expect(res.status).toBe(500)
    expect(res.text).toBe('File not found in the request')
  })
})

describe('POST /org/v1/search', () => {
  it('forwards the body with the sb headers', async () => {
    mockedAxios.mockResolvedValue({ data: { result: 'orgs' }, status: 200 })
    const res = await supertest(buildApp({ session: { rootOrgId: 'org-1', userRoles: ['PUBLIC'] } }))
      .post('/proxies/v8/org/v1/search').send({ request: { filters: {} } })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ result: 'orgs' })
    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
      data: { request: { filters: {} } },
      headers: { Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' },
      method: 'POST',
      url: `${CONSTANTS.KONG_API_BASE}/org/v1/search`,
    }))
  })

  it('scopes the search to the state for STATE_ADMIN', async () => {
    mockedAxios.mockResolvedValue({ data: {}, status: 200 })
    await supertest(buildApp({ session: { rootOrgId: 'org-1', userRoles: ['STATE_ADMIN'] } }))
      .post('/proxies/v8/org/v1/search').send({ request: { filters: {} } })
    expect(mockedAxios.mock.calls[0][0].data).toEqual({ request: { filters: { ministryOrStateId: 'org-1' } } })
  })

  it('responds 500 on failure', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp({ session: { userRoles: [] } })).post('/proxies/v8/org/v1/search').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to search organisations' })
  })
})

describe('GET /data/v1/system/settings/get/orgTypeList', () => {
  const value = JSON.stringify({ orgTypeList: [{ name: 'CBC' }, { name: 'MINISTRY' }] })

  it('returns the list unchanged for non state admins', async () => {
    mockedAxios.mockResolvedValue({ data: { result: { response: { value } } }, status: 200 })
    const res = await supertest(buildApp({ session: { userRoles: ['PUBLIC'] } })).get('/proxies/v8/data/v1/system/settings/get/orgTypeList')
    expect(res.status).toBe(200)
    expect(res.body.result.response.value).toBe(value)
    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
      headers: { Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' },
      method: 'GET',
      url: `${CONSTANTS.KONG_API_BASE}/data/v1/system/settings/get/orgTypeList`,
    }))
  })

  it('hides CBC/CBP/STATE for state admins', async () => {
    mockedAxios.mockResolvedValue({ data: { result: { response: { value } } }, status: 200 })
    const res = await supertest(buildApp({ session: { userRoles: ['STATE_ADMIN'] } }))
      .get('/proxies/v8/data/v1/system/settings/get/orgTypeList')
    expect(JSON.parse(res.body.result.response.value)).toEqual({ orgTypeList: [{ name: 'CBC', isHidden: true }, { name: 'MINISTRY' }] })
  })

  it('responds 500 on failure', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp({ session: { userRoles: [] } })).get('/proxies/v8/data/v1/system/settings/get/orgTypeList')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to fetch org type list' })
  })
})

describe.each([
  ['/course/v1/batch/getParticipants', `${CONSTANTS.KONG_API_BASE}/course/v1/batch/participants/list`],
  ['/externaltraining/v1/batch/getParticipants', `${CONSTANTS.KONG_API_BASE}/externaltraining/v1/batch/participants/list`],
])('POST %s', (path, participantsUrl) => {
  const body = { request: { filters: { batchId: 'b1', currentOffSet: 0, deptName: 'dept-a', limit: 10 } } }
  const profile = (id: string, channel: string) => ({
    channel,
    firstName: 'F' + id,
    id,
    lastName: 'L' + id,
    profileDetails: {
      personalDetails: { mobile: 99, primaryEmail: id + '@x.in' },
      professionalDetails: [{ designationOther: 'Other' }],
    },
    rootOrgName: 'Root ' + id,
  })

  it('looks up participants, filters by department and returns users with the total count', async () => {
    mockedAxios.post.mockResolvedValue({ data: { result: { batch: { count: 2, participants: ['u1', 'u2'] } } }, status: 200 })
    mockedAxios.mockResolvedValue({
      data: { result: { response: { content: [profile('u1', 'dept-a'), profile('u2', 'dept-b')], count: 2 } } },
    })
    const res = await supertest(buildApp()).post(`/proxies/v8${path}`).send(body)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      totalCount: 2,
      userlist: [{
        city: '', department: 'Root u1', desc: '', designation: 'Other', email: 'u1@x.in', first_name: 'Fu1',
        last_name: 'Lu1', phone_No: 99, userLocation: '', user_id: 'u1',
      }],
    })
    expect(mockedAxios.post).toHaveBeenCalledWith(participantsUrl,
      { request: { batch: { active: true, batchId: 'b1', currentOffSet: 0, limit: 10 } } },
      expect.objectContaining({ headers: { Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' } }))
    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
      data: { request: { filters: { userId: ['u1', 'u2'] } } },
      headers: { Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' },
      method: 'POST',
      url: `${CONSTANTS.KONG_API_BASE}/user/v1/search`,
    }))
  })

  it('returns all users when no department is given, and 0 count when missing', async () => {
    mockedAxios.post.mockResolvedValue({ data: { result: { batch: { participants: ['u1', 'u2'] } } }, status: 200 })
    mockedAxios.mockResolvedValue({
      data: { result: { response: { content: [profile('u1', 'dept-a'), { firstName: 'N', id: 'u2', lastName: 'M' }], count: 2 } } },
    })
    const res = await supertest(buildApp()).post(`/proxies/v8${path}`).send({ request: { filters: { batchId: 'b1' } } })
    expect(res.body.totalCount).toBe(0)
    expect(res.body.userlist.map((u: { user_id: string }) => u.user_id)).toEqual(['u1', 'u2'])
    expect(res.body.userlist[1]).toEqual({
      city: '', desc: '', designation: '', email: '', first_name: 'N', last_name: 'M', phone_No: 0, userLocation: '', user_id: 'u2',
    })
  })

  it('skips the user search when there are no participants', async () => {
    mockedAxios.post.mockResolvedValue({ data: { result: { batch: { count: 0, participants: [] } } }, status: 200 })
    const res = await supertest(buildApp()).post(`/proxies/v8${path}`).send(body)
    expect(res.body).toEqual({ totalCount: 0, userlist: [] })
    expect(mockedAxios).not.toHaveBeenCalled()
  })

  it('forwards upstream error status and body', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: { err: 'x' }, status: 404 } })
    const res = await supertest(buildApp()).post(`/proxies/v8${path}`).send(body)
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ err: 'x' })
  })

  it('falls back to 500 with the unknown error body', async () => {
    const res = await supertest(buildApp()).post(`/proxies/v8${path}`).send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('GET /api/user/v2/read', () => {
  it('reads the logged-in user with the sb headers', async () => {
    mockedAxios.mockResolvedValue({ data: { responseCode: 'OK', result: 'me' }, status: 200 })
    const res = await supertest(buildApp()).get('/proxies/v8/api/user/v2/read')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ responseCode: 'OK', result: 'me' })
    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({
      headers: { Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' },
      method: 'GET',
      url: `${CONSTANTS.KONG_API_BASE}/user/v2/read/user-1`,
    }))
  })

  it('responds 400 with the upstream body when reading another user fails', async () => {
    const other = '11111111-2222-3333-4444-555555555555'
    mockedAxios.mockResolvedValue({ data: { responseCode: 'NOT_FOUND' }, status: 200 })
    const res = await supertest(buildApp()).get(`/proxies/v8/api/user/v2/read/${other}`)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ responseCode: 'NOT_FOUND' })
    expect(mockedAxios.mock.calls[0][0].url).toBe(`${CONSTANTS.KONG_API_BASE}/user/v2/read/${other}`)
  })
})
