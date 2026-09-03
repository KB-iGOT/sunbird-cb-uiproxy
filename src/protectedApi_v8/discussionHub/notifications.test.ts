jest.mock('axios', () => ({ get: jest.fn() }))
jest.mock('../../utils/discussionHub-helper', () => ({
  getUserUIDBySession: jest.fn(),
}))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { getUserUIDBySession } from '../../utils/discussionHub-helper'
import { CONSTANTS } from '../../utils/env'
import { notificationsApi } from './notifications'

const mockedAxios = axios as unknown as { get: jest.Mock }
const mockedGetUserUIDBySession = getUserUIDBySession as jest.Mock

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'f:org:user-1' }, token: 'tok' } } }
    next()
  })
  app.use(notificationsApi)
  return app
}

describe('notificationsApi', () => {
  it('fetches notifications scoped to the session uid', async () => {
    mockedGetUserUIDBySession.mockResolvedValue('nbb-uid-1')
    mockedAxios.get.mockResolvedValue({ data: { notifications: [] } })

    const res = await supertest(buildApp()).get('/')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ notifications: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/nodebb/auth/api/notifications?_uid=nbb-uid-1'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' }),
      })
    )
  })

  it('forwards the upstream error status/body when the request fails', async () => {
    mockedGetUserUIDBySession.mockResolvedValue('nbb-uid-1')
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })

  it('falls back to an empty body with a 500 when the failure has no response', async () => {
    mockedGetUserUIDBySession.mockResolvedValue('nbb-uid-1')
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({})
  })
})
