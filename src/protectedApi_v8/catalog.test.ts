jest.mock('axios', () => ({ get: jest.fn() }))
jest.mock('../service/catalog', () => ({
  getFilterUnitByType: jest.fn(),
  getFilters: jest.fn(),
}))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { getFilterUnitByType, getFilters } from '../service/catalog'
import { CONSTANTS } from '../utils/env'
import { catalogApi } from './catalog'

const mockedAxios = axios as unknown as { get: jest.Mock }
const mockedGetFilters = getFilters as jest.Mock
const mockedGetFilterUnitByType = getFilterUnitByType as jest.Mock

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(catalogApi)
  return app
}

describe('catalogApi GET /', () => {
  it('returns the upstream catalog', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ code: 'c1' }], status: 200 })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ code: 'c1' }])
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.KONG_API_BASE}/v1/catalog/`, expect.any(Object))
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('catalogApi POST /tags', () => {
  it('returns 400 when rootorg header is missing', async () => {
    const res = await supertest(buildApp()).post('/tags').send({ tags: 'x', type: 'department' })
    expect(res.status).toBe(400)
  })

  it('returns the matching catalog children', async () => {
    mockedGetFilters.mockResolvedValue([{ children: [], type: 'department' }])
    mockedGetFilterUnitByType.mockReturnValue({ children: ['a', 'b'], type: 'department' })

    const res = await supertest(buildApp())
      .post('/tags')
      .set('rootorg', 'igot')
      .send({ tags: 'department', type: 'catalogPaths' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(['a', 'b'])
    expect(mockedGetFilters).toHaveBeenCalledWith('user-1', 'igot', 'catalogPaths')
  })

  it('returns 400 when no matching catalog unit is found', async () => {
    mockedGetFilters.mockResolvedValue([])
    mockedGetFilterUnitByType.mockReturnValue(null)

    const res = await supertest(buildApp()).post('/tags').set('rootorg', 'igot').send({ tags: 'x', type: 'y' })
    expect(res.status).toBe(400)
  })

  it('falls back to a generic 500 error when the lookup throws', async () => {
    mockedGetFilters.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/tags').set('rootorg', 'igot').send({ tags: 'x', type: 'y' })
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
