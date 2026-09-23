jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.get = jest.fn()
  fn.post = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { progressApi } from './progress'

const mockedAxios = axios as unknown as jest.Mock & { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    // extractUserId (used by the GET / and POST / routes) splits sub on ':' and takes segment [2]
    req.kauth = { grant: { access_token: { content: { sub: 'f:org:user-1' }, token: 'tok' } } }
    next()
  })
  app.use(progressApi)
  return app
}

describe('progressApi GET /:contentId', () => {
  it('fetches progress meta for the extracted user and content', async () => {
    mockedAxios.get.mockResolvedValue({ data: { progress: 50 } })
    const res = await supertest(buildApp()).get('/content-1').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ progress: 50 })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.PROGRESS_API_BASE}/v1/users/f:org:user-1/content-ids/content-1/progress-meta`,
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/content-1')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('progressApi GET /', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(400)
  })

  it('fetches the content list progress hash', async () => {
    mockedAxios.mockResolvedValue({ data: { hash: 'abc' } })
    const res = await supertest(buildApp()).get('/').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ hash: 'abc' })
  })
})

describe('progressApi POST /', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).post('/').send({})
    expect(res.status).toBe(400)
  })

  it('posts progress data for the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { updated: true }, status: 200 })
    const res = await supertest(buildApp()).post('/').set('org', 'dopt').set('rootOrg', 'igot').send({ x: 1 })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v3/users/user-1/contentlist/progress'),
      { x: 1 },
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })
})
