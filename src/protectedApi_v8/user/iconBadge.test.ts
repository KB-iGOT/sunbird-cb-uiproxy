jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { iconBadgeApi } from './iconBadge'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(iconBadgeApi)
  return app
}

describe('iconBadgeApi', () => {
  it('returns just the totalCount from the notification summary', async () => {
    mockedAxios.get.mockResolvedValue({ data: { totalCount: 4, unread: [] } })
    const res = await supertest(buildApp()).get('/unseenNotificationCount').set('rootOrg', 'igot')

    expect(res.status).toBe(200)
    expect(res.body).toBe(4)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.NOTIFICATIONS_API_BASE}/v1/users/user-1/notification-summary`,
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/unseenNotificationCount')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
