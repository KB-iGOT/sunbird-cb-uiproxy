jest.mock('axios', () => jest.fn())
jest.mock('../content', () => ({ getContentDetails: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { getContentDetails } from '../content'
import { historyApi } from './history'

const mockedAxios = axios as unknown as jest.Mock
const mockedGetContentDetails = getContentDetails as jest.Mock

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(historyApi)
  return app
}

describe('historyApi GET /', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(400)
  })

  it('returns processed continue-learning contents', async () => {
    mockedAxios.mockResolvedValue({
      data: { pageState: 'p2', results: [{ appIcon: 'http://private-a.example.com/icon.png', contentType: 'Course' }] },
    })
    const res = await supertest(buildApp()).get('/').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body.hasMore).toBe(true)
    expect(res.body.contents[0].appIcon).toBe('/apis/proxies/v8/icon.png')
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('historyApi GET /:contentId', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/c1')
    expect(res.status).toBe(400)
  })

  it('returns null when there is no continue-learning entry', async () => {
    mockedAxios.mockResolvedValue({ data: { results: [] } })
    const res = await supertest(buildApp()).get('/c1').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toBeNull()
  })

  it('merges the continue-learning data with the fetched content details', async () => {
    mockedAxios.mockResolvedValue({
      data: { results: [{ continueLearningData: { data: { progress: 40 }, resourceId: 'c1' } }] },
    })
    mockedGetContentDetails.mockResolvedValue({ identifier: 'c1', name: 'Course 1' })

    const res = await supertest(buildApp()).get('/c1').set('org', 'dopt').set('rootOrg', 'igot')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ continueData: { progress: 40 }, identifier: 'c1', name: 'Course 1' })
    expect(mockedGetContentDetails).toHaveBeenCalledWith('c1', 'igot', 'dopt', 'user-1', 'minimal')
  })
})

describe('historyApi POST /continue', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).post('/continue').send({})
    expect(res.status).toBe(400)
  })

  it('saves player continuity data', async () => {
    mockedAxios.mockResolvedValue({ data: { saved: true }, status: 200 })
    const res = await supertest(buildApp()).post('/continue').set('org', 'dopt').set('rootOrg', 'igot').send({ progress: 10 })
    expect(res.status).toBe(200)
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ progress: 10 }), method: 'POST' })
    )
  })
})
