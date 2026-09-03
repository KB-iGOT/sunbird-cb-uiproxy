jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { accessControlApi, checkContentAccess } from './accessControl'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(accessControlApi)
  return app
}

describe('checkContentAccess', () => {
  it('returns the access map from the upstream response', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { response: { c1: { hasAccess: true } } } } })
    const result = await checkContentAccess('c1', 'user-1')
    expect(result).toEqual({ c1: { hasAccess: true } })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.ACCESS_CONTROL_API_BASE}/accesscontrol/user/user-1/content?contentIds=c1`,
      expect.any(Object)
    )
  })

  it('returns an empty object when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    expect(await checkContentAccess('c1', 'user-1')).toEqual({})
  })
})

describe('accessControlApi POST /', () => {
  it('checks access for the given content ids and extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { response: { c1: { hasAccess: true } } } } })
    const res = await supertest(buildApp()).post('/').send({ contentIds: ['c1', 'c2'] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ c1: { hasAccess: true } })
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('contentIds=c1,c2'), expect.any(Object))
  })
})

describe('accessControlApi GET /', () => {
  it('returns the access-control result when present', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { c1: true } } })
    const res = await supertest(buildApp()).get('/').set('wid', 'user-1').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ c1: true })
  })

  it('returns 404 when the upstream has no result', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} })
    const res = await supertest(buildApp()).get('/').set('wid', 'user-1').set('rootOrg', 'igot')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'No Data found' })
  })

  it('falls back to a generic 500 error when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/').set('wid', 'user-1').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
