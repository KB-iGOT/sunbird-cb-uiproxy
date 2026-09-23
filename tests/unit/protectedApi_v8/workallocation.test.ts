jest.mock('axios')

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { axiosRequestConfig } from '../../../src/configs/request.config'
import { workAllocationApi } from '../../../src/protectedApi_v8/workallocation'
import { CONSTANTS } from '../../../src/utils/env'
import { ERROR } from '../../../src/utils/message'

const mockedAxios = axios as jest.Mocked<typeof axios>

const KONG = CONSTANTS.KONG_API_BASE
const EXT = CONSTANTS.SB_EXT_API_BASE_2
const genericError = { error: ERROR.GENERAL_ERR_MSG }

// tslint:disable-next-line: no-any
function buildApp(kauth: any = { grant: { access_token: { content: { sub: 'f:abc:user-1' }, token: 'tok' } } }) {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = kauth
    next()
  })
  app.use('/wa', workAllocationApi)
  return app
}

const apiKeyHeaders = { Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' }
const apiKeyUserHeaders = { Authorization: CONSTANTS.SB_API_KEY, userId: 'user-1', 'x-authenticated-user-token': 'tok' }
const bearerUserHeaders = { Authorization: 'Bearer tok', userId: 'user-1' }

beforeEach(() => {
  jest.resetAllMocks()
})

// tslint:disable-next-line: no-any
function lastConfig(mock: { mock: { calls: any[][] } }, configIndex: number): any {
  return mock.mock.calls[0][configIndex]
}

describe('workAllocationApi POST routes that require a userId', () => {
  const cases = [
    { path: '/add', url: `${KONG}/v1/workallocation/add`, headers: bearerUserHeaders },
    { path: '/update', url: `${EXT}/v1/workallocation/update`, headers: bearerUserHeaders },
    { path: '/v2/add', url: `${KONG}/v2/workallocation/add`, headers: apiKeyUserHeaders },
    { path: '/v2/update', url: `${KONG}/v2/workallocation/update`, headers: apiKeyUserHeaders },
    { path: '/add/workorder', url: `${KONG}/v2/workallocation/add/workorder`, headers: apiKeyUserHeaders },
    { path: '/update/workorder', url: `${KONG}/v2/workallocation/update/workorder`, headers: apiKeyUserHeaders },
    { path: '/copy/workOrder', url: `${KONG}/v2/workallocation/copy/workOrder`, headers: apiKeyUserHeaders },
  ]

  cases.forEach(({ path, url, headers }) => {
    describe(path, () => {
      it('forwards the body with the expected headers and relays status and data', async () => {
        mockedAxios.post.mockResolvedValue({ data: { ok: path }, status: 201 })
        const res = await supertest(buildApp()).post(`/wa${path}`).send({ a: 1 })
        expect(res.status).toBe(201)
        expect(res.body).toEqual({ ok: path })
        expect(mockedAxios.post).toHaveBeenCalledTimes(1)
        expect(mockedAxios.post.mock.calls[0][0]).toBe(url)
        expect(mockedAxios.post.mock.calls[0][1]).toEqual({ a: 1 })
        expect(lastConfig(mockedAxios.post, 2)).toStrictEqual({ ...axiosRequestConfig, headers })
      })

      it('prefers the wid header as userId', async () => {
        mockedAxios.post.mockResolvedValue({ data: {}, status: 200 })
        await supertest(buildApp()).post(`/wa${path}`).set('wid', 'wid-9').send({})
        expect(lastConfig(mockedAxios.post, 2).headers.userId).toBe('wid-9')
      })

      it('returns 400 NO_USER_ID when the userId cannot be extracted', async () => {
        const kauth = { grant: { access_token: { content: { sub: 'no-colons' }, token: 'tok' } } }
        const res = await supertest(buildApp(kauth)).post(`/wa${path}`).send({})
        expect(res.status).toBe(400)
        expect(res.text).toBe('NO_USER_ID')
        expect(mockedAxios.post).not.toHaveBeenCalled()
      })

      it('returns 500 with the generic error when extracting the userId throws', async () => {
        const res = await supertest(buildApp(null)).post(`/wa${path}`).send({})
        expect(res.status).toBe(500)
        expect(res.body).toEqual(genericError)
        expect(mockedAxios.post).not.toHaveBeenCalled()
      })

      it('forwards the upstream error status and body', async () => {
        mockedAxios.post.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
        const res = await supertest(buildApp()).post(`/wa${path}`).send({})
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: 'bad' })
      })

      it('falls back to 500 with the generic error body', async () => {
        mockedAxios.post.mockRejectedValue(new Error('down'))
        const res = await supertest(buildApp()).post(`/wa${path}`).send({})
        expect(res.status).toBe(500)
        expect(res.body).toEqual(genericError)
      })
    })
  })
})

describe('workAllocationApi POST routes without userId validation', () => {
  const cases = [
    { path: '/userSearch', url: `${EXT}/v1/workallocation/getUsers`, headers: {} },
    { path: '/getWorkOrders', url: `${KONG}/v2/workallocation/getWorkOrders`, headers: apiKeyHeaders },
  ]

  cases.forEach(({ path, url, headers }) => {
    describe(path, () => {
      it('forwards the body with the expected headers and relays status and data', async () => {
        mockedAxios.post.mockResolvedValue({ data: { ok: path }, status: 202 })
        const res = await supertest(buildApp()).post(`/wa${path}`).send({ q: 'x' })
        expect(res.status).toBe(202)
        expect(res.body).toEqual({ ok: path })
        expect(mockedAxios.post.mock.calls[0][0]).toBe(url)
        expect(mockedAxios.post.mock.calls[0][1]).toEqual({ q: 'x' })
        expect(lastConfig(mockedAxios.post, 2)).toStrictEqual({ ...axiosRequestConfig, headers })
      })

      it('forwards the upstream error status and body', async () => {
        mockedAxios.post.mockRejectedValue({ response: { data: { error: 'bad' }, status: 409 } })
        const res = await supertest(buildApp()).post(`/wa${path}`).send({})
        expect(res.status).toBe(409)
        expect(res.body).toEqual({ error: 'bad' })
      })

      it('falls back to 500 with the generic error body', async () => {
        mockedAxios.post.mockRejectedValue(new Error('down'))
        const res = await supertest(buildApp()).post(`/wa${path}`).send({})
        expect(res.status).toBe(500)
        expect(res.body).toEqual(genericError)
      })
    })
  })
})

describe('workAllocationApi GET routes', () => {
  const cases = [
    { path: '/user/autocomplete/jo', url: `${KONG}/v1/workallocation/users/autocomplete?searchTerm=jo` },
    { path: '/getWorkOrderById/wo-1', url: `${KONG}/v2/workallocation/getWorkOrderById/wo-1` },
    { path: '/getWorkAllocationById/wa-1', url: `${KONG}/v2/workallocation/getWorkAllocationById/wa-1` },
    { path: '/getUserBasicInfo/u-1', url: `${KONG}/v2/workallocation/user/basicInfo/u-1` },
    { path: '/getUserCompetencies/u-1', url: `${KONG}/v2/workallocation/user/competencies/u-1` },
  ]

  cases.forEach(({ path, url }) => {
    describe(path, () => {
      it('calls the upstream with the api key headers and relays status and data', async () => {
        mockedAxios.get.mockResolvedValue({ data: { ok: path }, status: 203 })
        const res = await supertest(buildApp()).get(`/wa${path}`)
        expect(res.status).toBe(203)
        expect(res.body).toEqual({ ok: path })
        expect(mockedAxios.get).toHaveBeenCalledTimes(1)
        expect(mockedAxios.get.mock.calls[0][0]).toBe(url)
        expect(lastConfig(mockedAxios.get, 1)).toStrictEqual({ ...axiosRequestConfig, headers: apiKeyHeaders })
      })

      it('forwards the upstream error status and body', async () => {
        mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
        const res = await supertest(buildApp()).get(`/wa${path}`)
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: 'bad' })
      })

      it('falls back to 500 with the generic error body', async () => {
        mockedAxios.get.mockRejectedValue(new Error('down'))
        const res = await supertest(buildApp()).get(`/wa${path}`)
        expect(res.status).toBe(500)
        expect(res.body).toEqual(genericError)
      })
    })
  })

  describe('/getWOPdf/:workOrderId', () => {
    it('requests the pdf as an arraybuffer and relays the status', async () => {
      mockedAxios.get.mockResolvedValue({ data: Buffer.from('%PDF'), status: 200 })
      const res = await supertest(buildApp()).get('/wa/getWOPdf/wo-1')
      expect(res.status).toBe(200)
      expect(mockedAxios.get.mock.calls[0][0]).toBe(`${KONG}/getWOPdf/wo-1`)
      expect(lastConfig(mockedAxios.get, 1)).toStrictEqual({
        ...axiosRequestConfig,
        headers: { Accept: 'application/pdf', ...apiKeyHeaders },
        responseType: 'arraybuffer',
      })
    })

    it('forwards the upstream error status and body', async () => {
      mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
      const res = await supertest(buildApp()).get('/wa/getWOPdf/wo-1')
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'bad' })
    })

    it('falls back to 500 with the generic error body', async () => {
      mockedAxios.get.mockRejectedValue(new Error('down'))
      const res = await supertest(buildApp()).get('/wa/getWOPdf/wo-1')
      expect(res.status).toBe(500)
      expect(res.body).toEqual(genericError)
    })
  })
})
