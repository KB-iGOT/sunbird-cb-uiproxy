jest.mock('axios', () => ({ post: jest.fn(), put: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import fileUpload from 'express-fileupload'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { bannerApi } from './banner'

const mockedAxios = axios as unknown as { post: jest.Mock; put: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(fileUpload())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(bannerApi)
  return app
}

describe('bannerApi POST /publish', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/publish').send({})
    expect(res.status).toBe(400)
  })

  it('publishes the banners location to S3', async () => {
    mockedAxios.post.mockResolvedValue({ data: { published: true } })
    const res = await supertest(buildApp()).post('/publish').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining(`${CONSTANTS.CONTENT_API_BASE}/contentv3/publish/`),
      {},
      expect.any(Object)
    )
  })
})

describe('bannerApi POST /upload', () => {
  it('returns 500 when no file is present on the request', async () => {
    const res = await supertest(buildApp()).post('/upload')
    expect(res.status).toBe(500)
  })

  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/upload').attach('content', Buffer.from('img'), 'a.png')
    expect(res.status).toBe(400)
  })

  it('uploads the file to S3', async () => {
    mockedAxios.post.mockResolvedValue({ data: { uploaded: true } })
    const res = await supertest(buildApp())
      .post('/upload')
      .set('rootOrg', 'igot')
      .attach('content', Buffer.from('img'), 'a.png')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ uploaded: true })
  })
})

describe('bannerApi GET /currentBanners', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).get('/currentBanners')
    expect(res.status).toBe(400)
  })
})

describe('bannerApi POST /createBanner', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).post('/createBanner').send({})
    expect(res.status).toBe(400)
  })

  it('creates a new banner tagged with the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'b1' } })
    const res = await supertest(buildApp())
      .post('/createBanner')
      .set('rootOrg', 'igot')
      .set('org', 'dopt')
      .send({ title: 'x' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_2}/v1/banners/`,
      expect.objectContaining({ title: 'x', updatedBy: 'user-1' }),
      expect.any(Object)
    )
  })

  it('falls back to a generic error on failure', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/createBanner').set('rootOrg', 'igot').set('org', 'dopt').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('bannerApi POST /updateCurrentBanner', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).post('/updateCurrentBanner').send({})
    expect(res.status).toBe(400)
  })

  it('updates the current banners list', async () => {
    mockedAxios.post.mockResolvedValue({ data: { updated: true } })
    const res = await supertest(buildApp()).post('/updateCurrentBanner').set('rootOrg', 'igot').set('org', 'dopt').send({})
    expect(res.status).toBe(200)
  })
})

describe('bannerApi POST /updateBanner/:bannerId', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).post('/updateBanner/b1').send({})
    expect(res.status).toBe(400)
  })

  it('updates the given banner', async () => {
    mockedAxios.put.mockResolvedValue({ data: { updated: true } })
    const res = await supertest(buildApp()).post('/updateBanner/b1').set('rootOrg', 'igot').set('org', 'dopt').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.put).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_2}/v1/banners/b1`,
      expect.objectContaining({ updatedBy: 'user-1' }),
      expect.any(Object)
    )
  })
})
