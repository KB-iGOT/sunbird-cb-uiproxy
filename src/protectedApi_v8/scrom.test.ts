jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { scromApi } from './scrom'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(scromApi)
  return app
}

describe('scromApi GET /get/:id', () => {
  it('returns 400 when org/rootorg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/get/c1')
    expect(res.status).toBe(400)
  })

  it('fetches scrom data for the extracted userId and content', async () => {
    mockedAxios.get.mockResolvedValue({ data: { progress: 50 } })
    const res = await supertest(buildApp()).get('/get/c1').set('org', 'dopt').set('rootorg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ progress: 50 })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.AUTHORING_BACKEND}/action/scrom/fetch`,
      expect.objectContaining({ params: { contentId: 'c1', userId: 'user-1' } })
    )
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/get/c1').set('org', 'dopt').set('rootorg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('scromApi POST /add/:id', () => {
  it('saves scrom data, defaulting org/rootorg when headers are missing', async () => {
    mockedAxios.post.mockResolvedValue({ data: { saved: true } })
    const res = await supertest(buildApp()).post('/add/c1').send({ score: 80 })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.AUTHORING_BACKEND}/action/scrom/add`,
      expect.objectContaining({ contentId: 'c1', score: 80, userId: 'user-1' }),
      expect.objectContaining({ headers: { org: 'dopt', rootOrg: 'igot' } })
    )
  })
})

describe('scromApi DELETE /remove/:id', () => {
  it('returns 400 when org/rootorg headers are missing', async () => {
    const res = await supertest(buildApp()).delete('/remove/c1')
    expect(res.status).toBe(400)
  })

  it('removes scrom data for the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { removed: true } })
    const res = await supertest(buildApp()).delete('/remove/c1').set('org', 'dopt').set('rootorg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.AUTHORING_BACKEND}/action/scrom/delete`,
      {},
      expect.objectContaining({ params: { contentId: 'c1', userId: 'user-1' } })
    )
  })
})
