jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.post = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { shareApi } from './share'

const mockedAxios = axios as unknown as jest.Mock & { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(shareApi)
  return app
}

describe('shareApi POST /', () => {
  it('sends a share notification and returns the result payload', async () => {
    mockedAxios.post.mockResolvedValue({ data: { result: { sent: true } }, status: 200 })
    const res = await supertest(buildApp()).post('/').send({ to: 'a@b.com' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ sent: true })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/v1/Notification/Send`,
      { to: 'a@b.com' },
      expect.any(Object)
    )
  })
})

describe('shareApi POST /content', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).post('/content').send({})
    expect(res.status).toBe(400)
  })

  it('posts to the generic share-content event endpoint by default', async () => {
    mockedAxios.mockResolvedValue({ data: { ok: true }, status: 200 })
    const res = await supertest(buildApp()).post('/content').set('org', 'dopt').set('rootOrg', 'igot').send({ a: 1 })
    expect(res.status).toBe(200)
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ data: { a: 1 }, url: `${CONSTANTS.NOTIFICATIONS_API_BASE}/v1/notification/event` })
    )
  })

  it('remaps the payload and uses the v1 content-share endpoint for Ford', async () => {
    mockedAxios.mockResolvedValue({ data: { ok: true }, status: 200 })
    await supertest(buildApp())
      .post('/content')
      .set('org', 'dopt')
      .set('rootOrg', 'Ford')
      .send({
        'tag-value-pair': { '#message': 'hello', '#targetUrl': 'https://x' },
        'target-data': { identifier: 'do_1' },
        recipients: { sharedWith: ['u2'] },
      })

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          content_id: 'do_1',
          share_message: 'hello',
          shared_by: 'user-1',
          shared_with: ['u2'],
          targetUrl: 'https://x',
        },
        url: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/content-share`,
      })
    )
  })
})

describe('shareApi GET /shared', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/shared')
    expect(res.status).toBe(400)
  })

  it('returns processed shared contents', async () => {
    mockedAxios.mockResolvedValue({
      data: { shareDetails: [{ appIcon: 'http://private-a.example.com/icon.png', children: [] }] },
    })
    const res = await supertest(buildApp()).get('/shared').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body.hasMore).toBe(false)
    expect(res.body.contents[0].appIcon).toBe('/apis/proxies/v8/icon.png')
  })

  it('returns 500 with the raw error when the fetch fails', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/shared').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
  })
})
