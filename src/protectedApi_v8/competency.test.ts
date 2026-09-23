jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { competencyApi } from './competency'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'the-token' } } }
    next()
  })
  app.use(competencyApi)
  return app
}

describe('competencyApi GET /getCompetency', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/getCompetency')
    expect(res.status).toBe(400)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('fetches verified competency nodes using the authorization header', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'c1' }], status: 200 })
    const res = await supertest(buildApp()).get('/getCompetency').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'c1' }])
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.FRAC_API_BASE}/api/frac/getAllNodes?type=COMPETENCY&status=VERIFIED`,
      expect.objectContaining({ headers: { Authorization: 'Bearer the-token' } })
    )
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getCompetency').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('competencyApi POST /addCompetency', () => {
  it('creates a new competency node', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'c2' }, status: 201 })
    const res = await supertest(buildApp()).post('/addCompetency').send({ name: 'Java' })
    expect(res.status).toBe(201)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.FRAC_API_BASE}/api/frac/addDataNode`,
      { name: 'Java' },
      expect.any(Object)
    )
  })
})

describe('competencyApi POST /searchCompetency', () => {
  it('searches competency nodes', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ id: 'c1' }], status: 200 })
    const res = await supertest(buildApp()).post('/searchCompetency').send({ query: 'java' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.FRAC_API_BASE}/api/frac/searchNodes`,
      { query: 'java' },
      expect.any(Object)
    )
  })

  it('falls back to a generic 500 error when the search fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/searchCompetency').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
