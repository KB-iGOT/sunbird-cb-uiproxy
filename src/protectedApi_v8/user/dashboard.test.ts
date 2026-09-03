jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { dashboardApi } from './dashboard'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(dashboardApi)
  return app
}

describe('dashboardApi POST /course/details', () => {
  it('fetches course learning-history details for the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { details: [] } })
    const res = await supertest(buildApp()).post('/course/details').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ details: [] })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('/v3/users/user-1/dashboard/courses/details'),
      {},
      expect.objectContaining({ headers: expect.objectContaining({ rootOrg: 'igot' }) })
    )
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/course/details').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('dashboardApi GET /analytics/progress/:contentType', () => {
  it('fetches user progress analytics for the given content type', async () => {
    mockedAxios.get.mockResolvedValue({ data: { progress: [] } })
    const res = await supertest(buildApp()).get('/analytics/progress/Course?startDate=1&endDate=2')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ progress: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/userprogress?'),
      expect.any(Object)
    )
  })
})

describe('dashboardApi GET /course', () => {
  it('fetches the course dashboard for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { courses: [] }, status: 200 })
    const res = await supertest(buildApp()).get('/course?status=active').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ courses: [] })
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/course')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('dashboardApi GET /userOrgTime', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/userOrgTime')
    expect(res.status).toBe(400)
  })

  it('fetches time spent for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { minutes: 30 } })
    const res = await supertest(buildApp()).get('/userOrgTime').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ minutes: 30 })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining(`${CONSTANTS.TIMESPENT_API_BASE}/v3/users/user-1/dashboard/timespent`),
      expect.any(Object)
    )
  })
})
