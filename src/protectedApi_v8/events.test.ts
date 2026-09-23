jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { eventsApi } from './events'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(eventsApi)
  return app
}

describe('eventsApi', () => {
  it('returns the live-events payload from CONTENT_API_BASE', async () => {
    mockedAxios.get.mockResolvedValue({ data: { items: [] } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ items: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.CONTENT_API_BASE}/live-events`, expect.any(Object))
  })

  it('forwards the upstream error status/body when the request fails', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network down'))
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
