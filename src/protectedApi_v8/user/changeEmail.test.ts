jest.mock('axios', () => ({ put: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { changeEmailApi } from './changeEmail'

const mockedAxios = axios as unknown as { put: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(changeEmailApi)
  return app
}

describe('changeEmailApi', () => {
  it('updates the requested profile meta field for the extracted userId', async () => {
    mockedAxios.put.mockResolvedValue({ data: { updated: true } })
    const res = await supertest(buildApp()).put('/email').send({ metaTypeData: 'a@b.com', rootOrg: 'igot' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ updated: true })
    expect(mockedAxios.put).toHaveBeenCalledWith(
      `${CONSTANTS.USER_PROFILE_API_BASE}/user/user-1/email`,
      { metaTypeData: 'a@b.com', rootOrg: 'igot' },
      expect.objectContaining({ headers: expect.objectContaining({ 'content-Type': 'application/json' }) })
    )
  })

  it('forwards the upstream error status/body when the update fails', async () => {
    mockedAxios.put.mockRejectedValue({ response: { data: { error: 'conflict' }, status: 409 } })
    const res = await supertest(buildApp()).put('/email').send({})
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'conflict' })
  })
})
