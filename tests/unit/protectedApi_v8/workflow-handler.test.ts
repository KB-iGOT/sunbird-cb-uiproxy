jest.mock('axios')

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { axiosRequestConfig } from '../../../src/configs/request.config'
import { workflowHandlerApi } from '../../../src/protectedApi_v8/workflow-handler'
import { CONSTANTS } from '../../../src/utils/env'

const mockedAxios = axios as jest.Mocked<typeof axios>

const KONG = CONSTANTS.KONG_API_BASE
const WF = CONSTANTS.WORKFLOW_HANDLER_SERVICE_API_BASE
const unknownError = { error: 'Failed due to unknown reason' }

// tslint:disable-next-line: no-any
function buildApp(session?: any) {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object, session?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'f:abc:user-1' }, token: 'tok' } } }
    if (session) {
      req.session = session
    }
    next()
  })
  app.use('/wf', workflowHandlerApi)
  return app
}

const orgHeaders = {
  Authorization: CONSTANTS.SB_API_KEY,
  org: 'dopt',
  rootOrg: 'igot',
  'x-authenticated-user-token': 'tok',
}

// tslint:disable-next-line: no-any
function callConfig(mock: { mock: { calls: any[][] } }, configIndex: number): any {
  return mock.mock.calls[0][configIndex]
}

beforeEach(() => {
  jest.resetAllMocks()
})

describe('workflowHandlerApi POST routes', () => {
  const cases = [
    { path: '/transition', url: `${KONG}/workflow/transition`, extraHeaders: {} },
    { path: '/applicationsSearch', url: `${KONG}/workflow/applications/search`, extraHeaders: {} },
    { path: '/updateUserProfileWf', url: `${KONG}/workflow/updateUserProfileWF`, extraHeaders: {} },
    { path: '/userWfSearch', url: `${KONG}/workflow/getUserWF`, extraHeaders: { wid: 'wid-1' } },
    { path: '/userWFApplicationFieldsSearch', url: `${KONG}/workflow/getUserWFApplicationFields`,
      extraHeaders: { wid: 'wid-1' } },
    { path: '/profileApprovalSearch', url: `${KONG}/workflow/profile/approvalRequest/search`,
      extraHeaders: { 'x-authenticated-user-orgid': '' } },
    { path: '/v2/transition', url: `${KONG}/workflow/v2/transition`, extraHeaders: {} },
  ]

  cases.forEach(({ path, url, extraHeaders }) => {
    describe(path, () => {
      it('forwards the body with org headers and relays status and data', async () => {
        mockedAxios.post.mockResolvedValue({ data: { ok: path }, status: 201 })
        const res = await supertest(buildApp()).post(`/wf${path}`)
          .set('rootOrg', 'igot').set('org', 'dopt').set('wid', 'wid-1')
          .send({ a: 1 })
        expect(res.status).toBe(201)
        expect(res.body).toEqual({ ok: path })
        expect(mockedAxios.post).toHaveBeenCalledTimes(1)
        expect(mockedAxios.post.mock.calls[0][0]).toBe(url)
        expect(mockedAxios.post.mock.calls[0][1]).toEqual({ a: 1 })
        expect(callConfig(mockedAxios.post, 2)).toStrictEqual({
          ...axiosRequestConfig,
          headers: { ...orgHeaders, ...extraHeaders },
        })
      })

      it('returns 400 when the rootOrg header is missing', async () => {
        const res = await supertest(buildApp()).post(`/wf${path}`).set('org', 'dopt').send({})
        expect(res.status).toBe(400)
        expect(res.text).toBe('ERROR_NO_ORG_DATA')
        expect(mockedAxios.post).not.toHaveBeenCalled()
      })

      it('returns 400 when the org header is missing', async () => {
        const res = await supertest(buildApp()).post(`/wf${path}`).set('rootOrg', 'igot').send({})
        expect(res.status).toBe(400)
        expect(res.text).toBe('ERROR_NO_ORG_DATA')
        expect(mockedAxios.post).not.toHaveBeenCalled()
      })

      it('forwards the upstream error status and body', async () => {
        mockedAxios.post.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
        const res = await supertest(buildApp()).post(`/wf${path}`)
          .set('rootOrg', 'igot').set('org', 'dopt').send({})
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: 'bad' })
      })

      it('falls back to 500 with the unknown error body', async () => {
        mockedAxios.post.mockRejectedValue(new Error('down'))
        const res = await supertest(buildApp()).post(`/wf${path}`)
          .set('rootOrg', 'igot').set('org', 'dopt').send({})
        expect(res.status).toBe(500)
        expect(res.body).toEqual(unknownError)
      })
    })
  })

  it('/profileApprovalSearch forwards the session rootOrgId', async () => {
    mockedAxios.post.mockResolvedValue({ data: {}, status: 200 })
    await supertest(buildApp({ rootOrgId: 'org-42' })).post('/wf/profileApprovalSearch')
      .set('rootOrg', 'igot').set('org', 'dopt').send({})
    expect(callConfig(mockedAxios.post, 2).headers['x-authenticated-user-orgid']).toBe('org-42')
  })

  it('/userWfSearch forwards an absent wid as undefined', async () => {
    mockedAxios.post.mockResolvedValue({ data: {}, status: 200 })
    await supertest(buildApp()).post('/wf/userWfSearch').set('rootOrg', 'igot').set('org', 'dopt').send({})
    expect(callConfig(mockedAxios.post, 2).headers).toStrictEqual({ ...orgHeaders, wid: undefined })
  })
})

describe('workflowHandlerApi GET routes', () => {
  const cases = [
    { path: '/nextActionSearch/svc/INITIATE', url: `${KONG}/workflow/nextAction/svc/INITIATE`, headers: orgHeaders },
    { path: '/historyByApplicationIdAndWfId/app-1/wf-1', url: `${WF}/v1/workflow/wf-1/app-1/history`,
      headers: orgHeaders },
    { path: '/workflowProcess/wf-1', url: `${KONG}/workflow/workflowProcess/wf-1`,
      headers: { Authorization: CONSTANTS.SB_API_KEY, rootOrg: 'igot', 'x-authenticated-user-token': 'tok' } },
    { path: '/historyByApplicationId/app-1', url: `${WF}/v1/workflow/app-1/history`, headers: orgHeaders },
  ]

  cases.forEach(({ path, url, headers }) => {
    describe(path, () => {
      it('calls the upstream with org headers and relays status and data', async () => {
        mockedAxios.get.mockResolvedValue({ data: { ok: path }, status: 203 })
        const res = await supertest(buildApp()).get(`/wf${path}`).set('rootOrg', 'igot').set('org', 'dopt')
        expect(res.status).toBe(203)
        expect(res.body).toEqual({ ok: path })
        expect(mockedAxios.get).toHaveBeenCalledTimes(1)
        expect(mockedAxios.get.mock.calls[0][0]).toBe(url)
        expect(callConfig(mockedAxios.get, 1)).toStrictEqual({ ...axiosRequestConfig, headers })
      })

      it('does not validate org headers', async () => {
        mockedAxios.get.mockResolvedValue({ data: { ok: true }, status: 200 })
        const res = await supertest(buildApp()).get(`/wf${path}`)
        expect(res.status).toBe(200)
        expect(callConfig(mockedAxios.get, 1).headers.rootOrg).toBeUndefined()
      })

      it('forwards the upstream error status and body', async () => {
        mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
        const res = await supertest(buildApp()).get(`/wf${path}`)
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: 'bad' })
      })

      it('falls back to 500 with the unknown error body', async () => {
        mockedAxios.get.mockRejectedValue(new Error('down'))
        const res = await supertest(buildApp()).get(`/wf${path}`)
        expect(res.status).toBe(500)
        expect(res.body).toEqual(unknownError)
      })
    })
  })
})
