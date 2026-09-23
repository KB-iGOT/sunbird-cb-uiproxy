jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.delete = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { ratingApi } from './rating'

const mockedAxios = axios as unknown as jest.Mock & { delete: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(ratingApi)
  return app
}

describe('ratingApi GET /:contentId', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/c1')
    expect(res.status).toBe(400)
  })

  it('fetches the rating for the extracted userId', async () => {
    mockedAxios.mockResolvedValue({ data: { rating: 4 }, status: 200 })
    const res = await supertest(buildApp()).get('/c1').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${CONSTANTS.RATING_API_BASE}/v1/contents/c1/users/user-1/ratings` })
    )
  })
})

describe('ratingApi POST /rating', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/rating').send({})
    expect(res.status).toBe(400)
  })

  it('posts an average rating request', async () => {
    mockedAxios.mockResolvedValue({ data: { avg: 4.2 }, status: 200 })
    const res = await supertest(buildApp()).post('/rating').set('rootOrg', 'igot').send({ ids: ['c1'] })
    expect(res.status).toBe(200)
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ids: ['c1'] }, url: `${CONSTANTS.RATING_API_BASE}/v1/contents/average-rating` })
    )
  })
})

describe('ratingApi POST /:contentId', () => {
  it('submits a rating for the given content and extracted userId', async () => {
    mockedAxios.mockResolvedValue({ data: { saved: true }, status: 200 })
    const res = await supertest(buildApp()).post('/c1').set('rootOrg', 'igot').send({ rating: 5 })
    expect(res.status).toBe(200)
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${CONSTANTS.RATING_API_BASE}/v1/contents/c1/users/user-1/ratings` })
    )
  })

  it('falls back to a generic 500 error when the submit fails', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/c1').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('ratingApi DELETE /:id', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).delete('/c1')
    expect(res.status).toBe(400)
  })

  it('deletes the rating for the extracted userId', async () => {
    mockedAxios.delete.mockResolvedValue({ data: {}, status: 204 })
    const res = await supertest(buildApp()).delete('/c1').set('rootOrg', 'igot')
    expect(res.status).toBe(204)
    expect(mockedAxios.delete).toHaveBeenCalledWith(
      `${CONSTANTS.RATING_API_BASE}/v1/contents/c1/users/user-1/ratings`,
      expect.any(Object)
    )
  })
})
