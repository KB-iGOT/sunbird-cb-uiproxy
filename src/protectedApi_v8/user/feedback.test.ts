jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { feedbackApi } from './feedback'

const mockedAxios = axios as unknown as { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(feedbackApi)
  return app
}

describe('feedbackApi', () => {
  it('posts feedback scoped to the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true }, status: 200 })
    const res = await supertest(buildApp()).post('/').send({ rating: 5 })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/v1/course/feedback/add/user-1`,
      { rating: 5 },
      expect.any(Object)
    )
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: { error: 'bad' }, status: 400 } })
    const res = await supertest(buildApp()).post('/').send({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'bad' })
  })
})
