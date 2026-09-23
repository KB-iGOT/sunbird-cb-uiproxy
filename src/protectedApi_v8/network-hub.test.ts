jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { networkHubApi } from './network-hub'

const mockedAxios = axios as unknown as { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(networkHubApi)
  return app
}

describe('networkHubApi', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/users').send({})
    expect(res.status).toBe(400)
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('posts a request built from the body defaults and the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { users: [] } })
    const res = await supertest(buildApp()).post('/users').set('rootOrg', 'igot').send({})

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ users: [] })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/networkHub/users'),
      expect.objectContaining({
        department: '',
        intervalInDays: 7,
        limit: 20,
        offset: 0,
        type: 'latestUsers',
        userId: 'user-1',
      }),
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })

  it('honors overrides supplied in the request body', async () => {
    mockedAxios.post.mockResolvedValue({ data: {} })
    await supertest(buildApp())
      .post('/users')
      .set('rootOrg', 'igot')
      .send({ department: 'dopt', intervalInDays: 3, limit: 5, offset: 10, type: 'topUsers' })

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ department: 'dopt', intervalInDays: 3, limit: 5, offset: 10, type: 'topUsers' }),
      expect.any(Object)
    )
  })

  it('forwards the upstream error status/body when the request fails', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).post('/users').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })
})
