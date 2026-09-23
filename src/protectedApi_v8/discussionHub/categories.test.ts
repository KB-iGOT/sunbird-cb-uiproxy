jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { categoriesApi } from './categories'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(categoriesApi)
  return app
}

describe('categoriesApi GET /', () => {
  it('lists all discussion categories', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ name: 'General' }] })
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ name: 'General' }])
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/nodebb/api/categories`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: CONSTANTS.SB_API_KEY, rootOrg: 'igot' }) })
    )
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })
})

describe('categoriesApi GET /:cid/:slug?/:tid?', () => {
  it('fetches category details for the given cid', async () => {
    mockedAxios.get.mockResolvedValue({ data: { topics: [] } })
    const res = await supertest(buildApp()).get('/cat-1')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/nodebb/api/category/cat-1?page=1&sort=`,
      expect.any(Object)
    )
  })

  it('includes the slug and tid segments when given', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} })
    await supertest(buildApp()).get('/cat-1/general/topic-1?page=2&sort=new')
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/nodebb/api/category/cat-1/general/topic-1?page=2&sort=new`,
      expect.any(Object)
    )
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'not found' }, status: 404 } })
    const res = await supertest(buildApp()).get('/missing')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not found' })
  })
})
