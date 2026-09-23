jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { externalEventsApi } from './event-external'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(externalEventsApi)
  return app
}

describe('externalEventsApi', () => {
  it('returns the upstream response data', async () => {
    mockedAxios.get.mockResolvedValue({ data: { events: [] } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ events: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      'https://igot.in',
      expect.objectContaining({ headers: expect.objectContaining({ api_key: expect.any(String) }) })
    )
  })

  it('returns an empty object when the upstream has no data', async () => {
    mockedAxios.get.mockResolvedValue({ data: undefined })
    const res = await supertest(buildApp()).get('/')
    expect(res.body).toEqual({})
  })

  it('forwards the upstream error status/body when the request fails', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })

  it('falls back to a 500 with an empty body when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network down'))
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({})
  })
})
