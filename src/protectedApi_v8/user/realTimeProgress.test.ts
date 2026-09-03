jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.post = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { realTimeProgressApi } from './realTimeProgress'

const mockedAxios = axios as unknown as jest.Mock & { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(realTimeProgressApi)
  return app
}

describe('realTimeProgressApi POST /update/:contentId', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).post('/update/content-1').send({})
    expect(res.status).toBe(400)
  })

  it('posts the progress update for the extracted userId', async () => {
    mockedAxios.mockResolvedValue({ data: { updated: true } })
    const res = await supertest(buildApp())
      .post('/update/content-1')
      .set('org', 'dopt')
      .set('rootOrg', 'igot')
      .send({ progress: 50 })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ updated: true })
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { progress: 50 },
        method: 'POST',
        url: expect.stringContaining('/user-1/content/content-1/progress/update'),
      })
    )
  })

  it('falls back to a generic 500 error when the update fails', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/update/content-1').set('org', 'dopt').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('realTimeProgressApi POST /markAsComplete/:contentId', () => {
  it('marks the content as complete for the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { completed: true } })
    const res = await supertest(buildApp()).post('/markAsComplete/content-1').set('rootOrg', 'igot').send({})

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ completed: true })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/user-1/content/content-1/progress/update?markread=true'),
      {},
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })

  it('falls back to a generic 500 error when marking complete fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/markAsComplete/content-1').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
