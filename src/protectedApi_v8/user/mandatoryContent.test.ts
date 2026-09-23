jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { mandatoryContent } from './mandatoryContent'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'bearer-token' } } }
    next()
  })
  app.use(mandatoryContent)
  return app
}

describe('mandatoryContent', () => {
  it('returns 400 when org/rootOrg/wid headers are missing', async () => {
    const res = await supertest(buildApp()).get('/checkStatus')
    expect(res.status).toBe(400)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('checks the mandatory content status when all required headers are present', async () => {
    mockedAxios.get.mockResolvedValue({ data: { completed: true }, status: 200 })
    const res = await supertest(buildApp())
      .get('/checkStatus')
      .set('rootorg', 'igot')
      .set('org', 'dopt')
      .set('wid', 'user-1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ completed: true })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/v1/check/mandatoryContentStatus`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: CONSTANTS.SB_API_KEY,
          org: 'dopt',
          rootOrg: 'igot',
          wid: 'user-1',
          'x-authenticated-user-token': 'bearer-token',
        }),
      })
    )
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/checkStatus').set('rootorg', 'igot').set('org', 'dopt').set('wid', 'user-1')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
