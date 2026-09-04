jest.mock('axios', () => ({ delete: jest.fn(), get: jest.fn(), patch: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { topicsApi } from './topics'

const mockedAxios = axios as unknown as { delete: jest.Mock; get: jest.Mock; patch: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(topicsApi)
  return app
}

describe('topicsApi GET /', () => {
  it('returns the topics list when present', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { response: { topics: ['java'] } } } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(['java'])
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.SB_EXT_API_BASE}/v1/user/topic/read/user-1`, expect.any(Object))
  })

  it('returns 500 with the raw upstream data when there are no topics', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: {} } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(500)
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('topicsApi POST /', () => {
  it('adds a topic for the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { added: true } })
    const res = await supertest(buildApp()).post('/').send({ topic: 'java' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/v1/user/topic/add`,
      { request: { topic: 'java', userId: 'user-1' } },
      expect.any(Object)
    )
  })
})

describe('topicsApi GET /v2', () => {
  it('returns the user_interest array when present', async () => {
    mockedAxios.get.mockResolvedValue({ data: { user_interest: ['java'] } })
    const res = await supertest(buildApp()).get('/v2').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(['java'])
  })

  it('returns an empty array when user_interest is absent', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} })
    const res = await supertest(buildApp()).get('/v2')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([])
  })
})

describe('topicsApi DELETE /', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).delete('/').send({})
    expect(res.status).toBe(400)
  })

  it('removes interests for the extracted userId', async () => {
    mockedAxios.delete.mockResolvedValue({ data: { removed: true }, status: 200 })
    const res = await supertest(buildApp()).delete('/').set('rootOrg', 'igot').send({ ids: ['t1'] })
    expect(res.status).toBe(200)
    expect(mockedAxios.delete).toHaveBeenCalledWith(
      `${CONSTANTS.INTEREST_API_BASE}/v2/users/user-1/interests`,
      expect.objectContaining({ data: { ids: ['t1'] }, headers: { rootOrg: 'igot' } })
    )
  })
})

describe('topicsApi PATCH /addMultiple', () => {
  it('adds multiple interests', async () => {
    mockedAxios.patch.mockResolvedValue({ data: { added: true } })
    const res = await supertest(buildApp()).patch('/addMultiple').set('rootOrg', 'igot').send({ ids: ['t1', 't2'] })
    expect(res.status).toBe(200)
    expect(mockedAxios.patch).toHaveBeenCalledWith(
      `${CONSTANTS.INTEREST_API_BASE}/v3/users/user-1/interests`,
      { ids: ['t1', 't2'] },
      expect.any(Object)
    )
  })
})

describe('topicsApi PATCH /', () => {
  it('modifies interests', async () => {
    mockedAxios.patch.mockResolvedValue({ data: { modified: true } })
    const res = await supertest(buildApp()).patch('/').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.patch).toHaveBeenCalledWith(
      `${CONSTANTS.INTEREST_API_BASE}/v2/users/user-1/interests`,
      {},
      expect.any(Object)
    )
  })
})

describe('topicsApi GET /suggested', () => {
  it('returns suggested interests', async () => {
    mockedAxios.get.mockResolvedValue({ data: ['java'] })
    const res = await supertest(buildApp()).get('/suggested')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(['java'])
  })
})

describe('topicsApi GET /autocomplete', () => {
  it('returns autocomplete suggestions for the given query', async () => {
    mockedAxios.get.mockResolvedValue({ data: ['java'] })
    const res = await supertest(buildApp()).get('/autocomplete?query=ja')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.INTEREST_API_BASE}/v1/interests/auto?query=ja`,
      expect.any(Object)
    )
  })
})
