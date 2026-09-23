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
import { CONSTANTS } from '../../utils/env'
import { getCommonTnc, getTnc, getTncStatus, protectedTnc } from './tnc'

const mockedAxios = axios as unknown as jest.Mock & { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(protectedTnc)
  return app
}

describe('getCommonTnc', () => {
  it('fetches the common terms', async () => {
    mockedAxios.mockResolvedValue({ data: { termsAndConditions: [] } })
    const result = await getCommonTnc('igot', 'dopt')
    expect(result.data).toEqual({ termsAndConditions: [] })
  })

  it('throws when the request fails', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    await expect(getCommonTnc('igot', 'dopt')).rejects.toThrow()
  })
})

describe('getTnc', () => {
  it('marks a user as new when there are unaccepted terms without an accepted version', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { isAccepted: false, termsAndConditions: [{ acceptedVersion: null }] },
    })
    const result = await getTnc('user-1', 'igot', 'dopt')
    expect(result.isNewUser).toBe(true)
  })

  it('falls back to the common tnc when the user tnc lookup fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    mockedAxios.mockResolvedValue({ data: { termsAndConditions: [] } })
    const result = await getTnc('user-1', 'igot', 'dopt')
    expect(result.isNewUser).toBe(true)
  })

  it('throws when both the user and common tnc lookups fail', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    mockedAxios.mockRejectedValue(new Error('also down'))
    await expect(getTnc('user-1', 'igot', 'dopt')).rejects.toThrow()
  })
})

describe('getTncStatus', () => {
  it('returns the isAccepted flag', async () => {
    mockedAxios.get.mockResolvedValue({ data: { isAccepted: true, termsAndConditions: [] } })
    expect(await getTncStatus('user-1', 'igot', 'dopt')).toBe(true)
  })

  it('returns false when the lookup fails entirely', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    mockedAxios.mockRejectedValue(new Error('down'))
    expect(await getTncStatus('user-1', 'igot', 'dopt')).toBe(false)
  })
})

describe('protectedTnc GET /status', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/status')
    expect(res.status).toBe(400)
  })

  it('returns the tnc acceptance status', async () => {
    mockedAxios.get.mockResolvedValue({ data: { isAccepted: true, termsAndConditions: [] } })
    const res = await supertest(buildApp()).get('/status').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toBe(true)
  })
})

describe('protectedTnc GET /', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(400)
  })

  it('returns the tnc payload', async () => {
    mockedAxios.get.mockResolvedValue({ data: { isAccepted: true, termsAndConditions: [] } })
    const res = await supertest(buildApp()).get('/').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
  })
})

describe('protectedTnc POST /accept', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).post('/accept').send({})
    expect(res.status).toBe(400)
  })

  it('returns 204 on a successful acceptance', async () => {
    mockedAxios.mockResolvedValue({ data: { result: 'SUCCESS' } })
    const res = await supertest(buildApp()).post('/accept').set('org', 'dopt').set('rootOrg', 'igot').send({ termsAccepted: true })
    expect(res.status).toBe(204)
  })

  it('returns 500 with the response body when acceptance does not succeed', async () => {
    mockedAxios.mockResolvedValue({ data: { result: 'FAILED' } })
    const res = await supertest(buildApp()).post('/accept').set('org', 'dopt').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(500)
  })
})

describe('protectedTnc PATCH /postprocessing', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).patch('/postprocessing').send({})
    expect(res.status).toBe(400)
  })

  it('returns 200 with data when postprocessing succeeds with a body', async () => {
    mockedAxios.mockResolvedValue({ data: { processed: true } })
    const res = await supertest(buildApp()).patch('/postprocessing').set('org', 'dopt').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ processed: true })
  })

  it('returns 204 when postprocessing succeeds without a body', async () => {
    mockedAxios.mockResolvedValue({ data: undefined })
    const res = await supertest(buildApp()).patch('/postprocessing').set('org', 'dopt').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(204)
  })
})

describe('protectedTnc GET /system/settings/:configName', () => {
  it('fetches the named system config', async () => {
    mockedAxios.get.mockResolvedValue({ data: { value: 'x' }, status: 200 })
    const res = await supertest(buildApp()).get('/system/settings/theme')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.LEARNER_SERVICE_API_BASE}/v1/system/settings/get/theme`,
      expect.any(Object)
    )
  })
})

describe('protectedTnc POST /sbacceptTnc', () => {
  it('strips the "bearer " prefix from the Authorization header and accepts', async () => {
    mockedAxios.post.mockResolvedValue({ data: { accepted: true }, status: 200 })
    const res = await supertest(buildApp()).post('/sbacceptTnc').set('Authorization', 'bearer tok-1').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.LEARNER_SERVICE_API_BASE}/v1/user/tnc/accept`,
      {},
      expect.objectContaining({ headers: { 'X-Authenticated-User-Token': 'tok-1' } })
    )
  })
})
