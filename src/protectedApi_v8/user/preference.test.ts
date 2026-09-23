jest.mock('axios', () => ({ get: jest.fn(), put: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { getUserPreference, protectedPreference } from './preference'

const mockedAxios = axios as unknown as { get: jest.Mock; put: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(protectedPreference)
  return app
}

describe('getUserPreference', () => {
  it('returns the upstream preferences on success', async () => {
    mockedAxios.get.mockResolvedValue({ data: { theme: 'dark' } })
    const result = await getUserPreference('user-1', 'igot')
    expect(result).toEqual({ theme: 'dark' })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.PREFERENCE_API_BASE}/v1/user/user-1/preferences`,
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })

  it('returns an empty object when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    expect(await getUserPreference('user-1', 'igot')).toEqual({})
  })
})

describe('protectedPreference GET /', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(400)
  })

  it('returns preferences for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { theme: 'dark' } })
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ theme: 'dark' })
  })

  it('uses the wid query param over the extracted userId when given', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} })
    await supertest(buildApp()).get('/?wid=other-user').set('rootOrg', 'igot')
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/other-user/preferences'), expect.any(Object))
  })
})

describe('protectedPreference PUT /', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).put('/').send({})
    expect(res.status).toBe(400)
  })

  it('updates preferences for the extracted userId', async () => {
    mockedAxios.put.mockResolvedValue({ data: { theme: 'light' }, status: 200 })
    const res = await supertest(buildApp()).put('/').set('rootOrg', 'igot').send({ theme: 'light' })
    expect(res.status).toBe(200)
    expect(mockedAxios.put).toHaveBeenCalledWith(
      `${CONSTANTS.PREFERENCE_API_BASE}/v1/user/user-1/preferences`,
      { theme: 'light' },
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockedAxios.put.mockRejectedValue({ response: { data: { error: 'bad' }, status: 400 } })
    const res = await supertest(buildApp()).put('/').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'bad' })
  })
})
