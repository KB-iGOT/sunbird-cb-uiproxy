jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { telemetryApi } from './telemetry'

const mockedAxios = axios as unknown as { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(telemetryApi)
  return app
}

describe('telemetryApi', () => {
  it('forwards the telemetry payload and the upstream response', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'evt-1' }, status: 200 })
    const res = await supertest(buildApp()).post('/').send({ events: [] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'evt-1' })
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.TELEMETRY_SB_BASE}/v1/telemetry`, { events: [] }, expect.any(Object))
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
