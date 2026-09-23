jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { rdbmsApi } from './rdbms'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(rdbmsApi)
  return app
}

describe('rdbmsApi GET /initializeDb/:contentId', () => {
  it('initializes the db for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { initialized: true } })
    const res = await supertest(buildApp()).get('/initializeDb/c1')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.VIEWER_PLUGIN_RDBMS_API_BASE}/v1/users/user-1/resources/c1/initialize`,
      expect.any(Object)
    )
  })

  it('falls back to a generic error on failure', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/initializeDb/c1')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('rdbmsApi GET /conceptData/:contentId', () => {
  it('fetches concept data for the content id', async () => {
    mockedAxios.get.mockResolvedValue({ data: { concepts: [] } })
    const res = await supertest(buildApp()).get('/conceptData/c1')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.VIEWER_PLUGIN_RDBMS_API_BASE}/v1/db/conceptdata/resources/c1`,
      expect.any(Object)
    )
  })
})

describe('rdbmsApi GET /expectedOutput/:contentId', () => {
  it('fetches the expected output', async () => {
    mockedAxios.get.mockResolvedValue({ data: { output: 'x' } })
    const res = await supertest(buildApp()).get('/expectedOutput/c1')
    expect(res.status).toBe(200)
  })
})

describe('rdbmsApi GET /dbstructure/:contentId', () => {
  it('fetches the db table structure', async () => {
    mockedAxios.get.mockResolvedValue({ data: { tables: [] } })
    const res = await supertest(buildApp()).get('/dbstructure/c1')
    expect(res.status).toBe(200)
  })
})

describe('rdbmsApi GET /tableRefresh/:contentId', () => {
  it('fetches table info', async () => {
    mockedAxios.get.mockResolvedValue({ data: { tables: [] } })
    const res = await supertest(buildApp()).get('/tableRefresh/c1')
    expect(res.status).toBe(200)
  })
})

describe('rdbmsApi POST /executeQuery', () => {
  it('executes a query for the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { rows: [] } })
    const res = await supertest(buildApp()).post('/executeQuery').send({ query: 'select 1' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.VIEWER_PLUGIN_RDBMS_API_BASE}/v1/users/user-1/query/execute`,
      expect.objectContaining({ query: 'select 1' }),
      expect.any(Object)
    )
  })

  it('falls back to a generic error on failure', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/executeQuery').send({})
    expect(res.status).toBe(500)
  })
})

describe('rdbmsApi POST /compareQuery', () => {
  it('compares a query', async () => {
    mockedAxios.post.mockResolvedValue({ data: { match: true } })
    const res = await supertest(buildApp()).post('/compareQuery').send({})
    expect(res.status).toBe(200)
  })
})

describe('rdbmsApi POST /playground', () => {
  it('runs a playground query', async () => {
    mockedAxios.post.mockResolvedValue({ data: { rows: [] } })
    const res = await supertest(buildApp()).post('/playground').send({})
    expect(res.status).toBe(200)
  })
})

describe('rdbmsApi POST /compositeQuery/:type', () => {
  it('runs a composite query of the given type', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} })
    const res = await supertest(buildApp()).post('/compositeQuery/join').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/query/composite?type=join'),
      expect.any(Object),
      expect.any(Object)
    )
  })
})

describe('rdbmsApi POST /verifyExercise/:contentId', () => {
  it('verifies the exercise', async () => {
    mockedAxios.post.mockResolvedValue({ data: { verified: true } })
    const res = await supertest(buildApp()).post('/verifyExercise/c1').send({})
    expect(res.status).toBe(200)
  })
})

describe('rdbmsApi POST /submitExercise/:contentId', () => {
  it('submits the exercise', async () => {
    mockedAxios.post.mockResolvedValue({ data: { submitted: true } })
    const res = await supertest(buildApp()).post('/submitExercise/c1').send({})
    expect(res.status).toBe(200)
  })
})
