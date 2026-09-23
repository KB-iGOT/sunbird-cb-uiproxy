jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { tagsApi } from './tags'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(tagsApi)
  return app
}

describe('tagsApi GET /', () => {
  it('lists all tags, forwarding rootOrg and the auth token', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ name: 'igot' }] })
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot')

    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ name: 'igot' }])
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/nodebb/api/tags`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: CONSTANTS.SB_API_KEY, rootOrg: 'igot', 'x-authenticated-user-token': 'tok' }),
      })
    )
  })

  it('forwards the upstream error status/body when listing fails', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })
})

describe('tagsApi GET /:tagName', () => {
  it('returns topics for the given tag', async () => {
    mockedAxios.get.mockResolvedValue({ data: { topics: [] } })
    const res = await supertest(buildApp()).get('/karma')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ topics: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.KONG_API_BASE}/nodebb/api/tags/karma`, expect.any(Object))
  })

  it('forwards the upstream error status/body when the tag lookup fails', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'not found' }, status: 404 } })
    const res = await supertest(buildApp()).get('/missing')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not found' })
  })
})
