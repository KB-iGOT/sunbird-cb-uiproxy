jest.mock('axios', () => ({ get: jest.fn() }))
jest.mock('../../utils/discussionHub-helper', () => ({
  getUserUIDBySession: jest.fn(),
}))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { getUserUIDBySession } from '../../utils/discussionHub-helper'
import { CONSTANTS } from '../../utils/env'
import { topicsApi } from './topics'

const mockedAxios = axios as unknown as { get: jest.Mock }
const mockedGetUserUIDBySession = getUserUIDBySession as jest.Mock

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object; session?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    req.session = { uid: 'nbb-uid-1' } as any
    next()
  })
  app.use(topicsApi)
  return app
}

describe('topicsApi GET /recent', () => {
  it('lists recent topics with the configured category filter appended', async () => {
    mockedAxios.get.mockResolvedValue({ data: { topics: [] } })
    const res = await supertest(buildApp()).get('/recent').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining(CONSTANTS.DISCUSSION_CATEGORY_LIST),
      expect.any(Object)
    )
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).get('/recent')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })
})

describe('topicsApi GET /top', () => {
  it('lists top topics', async () => {
    mockedAxios.get.mockResolvedValue({ data: { topics: [] } })
    const res = await supertest(buildApp()).get('/top')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.KONG_API_BASE}/nodebb/api/top`, expect.any(Object))
  })
})

describe('topicsApi GET /popular', () => {
  it('lists popular topics', async () => {
    mockedAxios.get.mockResolvedValue({ data: { topics: [] } })
    const res = await supertest(buildApp()).get('/popular?page=2')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/nodebb/api/popular?page=2`,
      expect.any(Object)
    )
  })
})

describe('topicsApi GET /unread', () => {
  it('lists unread topics scoped to the session uid', async () => {
    mockedGetUserUIDBySession.mockResolvedValue('nbb-uid-1')
    mockedAxios.get.mockResolvedValue({ data: { topics: [] } })
    const res = await supertest(buildApp()).get('/unread')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/nodebb/auth/api/unread?_uid=nbb-uid-1'),
      expect.any(Object)
    )
  })
})

describe('topicsApi GET /unread/total', () => {
  it('returns the unread total scoped to the session uid', async () => {
    mockedGetUserUIDBySession.mockResolvedValue('nbb-uid-1')
    mockedAxios.get.mockResolvedValue({ data: { total: 3 } })
    const res = await supertest(buildApp()).get('/unread/total')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ total: 3 })
  })
})

describe('topicsApi GET /:tid', () => {
  it('fetches topic details by id, scoped to the session uid', async () => {
    mockedGetUserUIDBySession.mockResolvedValue('nbb-uid-1')
    mockedAxios.get.mockResolvedValue({ data: { tid: 42 } })
    const res = await supertest(buildApp()).get('/42?sort=newest')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/nodebb/auth/api/topic/42?page=1&_uid=nbb-uid-1&sort=newest'),
      expect.any(Object)
    )
  })
})
