jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { activity } from './activity'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(activity)
  return app
}

describe('activity', () => {
  it('fetches user activities and forwards org headers', async () => {
    mockedAxios.get.mockResolvedValue({ data: { activities: [] } })
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot').set('org', 'dopt')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ activities: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_3}/v1/activities/user/user-1`,
      expect.objectContaining({ headers: expect.objectContaining({ org: 'dopt', rootOrg: 'igot', wid: 'user-1' }) })
    )
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
