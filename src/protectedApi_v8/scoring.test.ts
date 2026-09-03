jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { scoringApi } from './scoring'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(scoringApi)
  return app
}

describe('scoringApi POST /calculate', () => {
  it('returns 400 when org/rootorg headers are missing', async () => {
    const res = await supertest(buildApp()).post('/calculate').send({})
    expect(res.status).toBe(400)
  })

  it('calculates and adds a score', async () => {
    mockedAxios.post.mockResolvedValue({ data: { score: 10 }, status: 200 })
    const res = await supertest(buildApp()).post('/calculate').set('org', 'dopt').set('rootorg', 'igot').send({ answers: [] })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/scoring/v1/add`,
      { answers: [] },
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: CONSTANTS.SB_API_KEY, org: 'dopt', rootOrg: 'igot' }) })
    )
  })
})

describe('scoringApi POST /fetch', () => {
  it('returns 400 when org/rootorg headers are missing', async () => {
    const res = await supertest(buildApp()).post('/fetch').send({})
    expect(res.status).toBe(400)
  })

  it('fetches a score', async () => {
    mockedAxios.post.mockResolvedValue({ data: { score: 10 }, status: 200 })
    const res = await supertest(buildApp()).post('/fetch').set('org', 'dopt').set('rootorg', 'igot').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.KONG_API_BASE}/scoring/v1/fetch`, {}, expect.any(Object))
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/fetch').set('org', 'dopt').set('rootorg', 'igot').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('scoringApi GET /getTemplate/:templateId', () => {
  it('returns 400 when org/rootorg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/getTemplate/t1')
    expect(res.status).toBe(400)
  })

  it('fetches the scoring template', async () => {
    mockedAxios.get.mockResolvedValue({ data: { template: {} }, status: 200 })
    const res = await supertest(buildApp()).get('/getTemplate/t1').set('org', 'dopt').set('rootorg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.KONG_API_BASE}/scoring/v1/getTemplate/t1`, expect.any(Object))
  })
})
