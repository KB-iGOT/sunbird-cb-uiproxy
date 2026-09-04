jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { badgeApi } from './badge'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(badgeApi)
  return app
}

const badgesPayload = {
  canEarn: [{ image: '/assets/instances/x.png' }],
  closeToEarning: [],
  // appendUrl concatenates without adding a separator, so callers must pass a leading slash
  earned: [{ image: '/earned.png' }],
  lastUpdatedDate: '2024-01-01',
  recent: [],
  totalPoints: 10,
}

describe('badgeApi GET /', () => {
  it('processes badge image urls', async () => {
    mockedAxios.get.mockResolvedValue({ data: badgesPayload })
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body.earned[0].image).toBe('/apis/proxies/v8/earned.png')
    expect(res.body.canEarn[0].image).toBe('/assets/instances/x.png')
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_2}/v3/users/user-1/badges`,
      expect.any(Object)
    )
  })

  it('returns 500 with the raw error on failure', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(500)
  })
})

describe('badgeApi GET /for/:wid', () => {
  it('returns badges for the given wid', async () => {
    mockedAxios.get.mockResolvedValue({ data: badgesPayload })
    const res = await supertest(buildApp()).get('/for/other-user')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_2}/v3/users/other-user/badges`,
      expect.any(Object)
    )
  })
})

describe('badgeApi GET /badgeDetail', () => {
  it('fetches badge detail for the given badgeIds', async () => {
    mockedAxios.get.mockResolvedValue({ data: badgesPayload })
    const res = await supertest(buildApp()).get('/badgeDetail?badgeIds=b1,b2')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/v1/users/user-1/badges/newUser/b1,b2'),
      expect.any(Object)
    )
  })
})

describe('badgeApi POST /newUser', () => {
  it('registers a new-user badge event', async () => {
    mockedAxios.post.mockResolvedValue({ data: { ok: true } })
    const res = await supertest(buildApp()).post('/newUser').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users/user-1/badges/newUser`,
      {},
      expect.any(Object)
    )
  })

  it('falls back to a generic 500 error on failure', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/newUser')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('badgeApi POST /update', () => {
  it('recalculates badges for the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { recalculated: true } })
    const res = await supertest(buildApp()).post('/update').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_2}/v1/User/user-1/recalculatebadges`,
      {},
      expect.any(Object)
    )
  })
})

describe('badgeApi GET /notification', () => {
  it('returns processed recent-badge notifications', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { result: { response: { recent_badge: { image: '/recent.png' }, totalPoints: [1] } } },
    })
    const res = await supertest(buildApp()).get('/notification')
    expect(res.status).toBe(200)
    expect(res.body.recent_badge.image).toBe('/apis/proxies/v8/recent.png')
    expect(res.body.totalPoints).toEqual([1])
  })

  it('returns default empty notification data when there is no result', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} })
    const res = await supertest(buildApp()).get('/notification')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ recent_badge: null, totalPoints: [] })
  })
})
