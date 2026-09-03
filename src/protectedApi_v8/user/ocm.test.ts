jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { ocmApi } from './ocm'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(ocmApi)
  return app
}

describe('ocmApi GET /getToDos/:id', () => {
  it('fetches the task group tasks for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { tasks: [] }, status: 200 })
    const res = await supertest(buildApp()).get('/getToDos/group-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tasks: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/v1/users/user-1/task_groups/group-1/tasks`,
      expect.any(Object)
    )
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getToDos/group-1')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
