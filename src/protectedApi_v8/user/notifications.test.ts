jest.mock('axios', () => ({ get: jest.fn(), patch: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { notificationsApi } from './notifications'

const mockedAxios = axios as unknown as { get: jest.Mock; patch: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(notificationsApi)
  return app
}

describe('notificationsApi PATCH /settings', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).patch('/settings').send({})
    expect(res.status).toBe(400)
  })

  it('updates notification settings for the extracted userId', async () => {
    mockedAxios.patch.mockResolvedValue({ data: { updated: true }, status: 200 })
    const res = await supertest(buildApp()).patch('/settings').set('rootOrg', 'igot').send({ enabled: true })
    expect(res.status).toBe(200)
    expect(mockedAxios.patch).toHaveBeenCalledWith(
      `${CONSTANTS.NOTIFICATIONS_API_BASE}/v1/users/user-1/events`,
      { enabled: true },
      expect.any(Object)
    )
  })
})

describe('notificationsApi GET /', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(400)
  })

  it('fetches notifications for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { notifications: [] } })
    const res = await supertest(buildApp()).get('/?page=1&size=10').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ notifications: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/v1/users/user-1/notifications'),
      expect.objectContaining({ params: expect.objectContaining({ page: '1', size: '10' }) })
    )
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('notificationsApi PATCH /:notificationId?/:classification?', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).patch('/n1').send({})
    expect(res.status).toBe(400)
  })

  it('marks a specific notification as seen', async () => {
    mockedAxios.patch.mockResolvedValue({ data: { seen: true } })
    const res = await supertest(buildApp()).patch('/n1').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.patch).toHaveBeenCalledWith(
      expect.stringContaining('/v1/users/user-1/notifications/n1'),
      {},
      expect.any(Object)
    )
  })
})

describe('notificationsApi GET /settings', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/settings')
    expect(res.status).toBe(400)
  })

  it('fetches notification settings for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { enabled: true }, status: 200 })
    const res = await supertest(buildApp()).get('/settings').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.NOTIFICATIONS_API_BASE}/v1/users/user-1/events`, expect.any(Object))
  })
})
