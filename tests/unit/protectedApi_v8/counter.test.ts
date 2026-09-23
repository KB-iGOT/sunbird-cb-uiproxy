jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../../src/utils/env'
import { counterApi } from '../../../src/protectedApi_v8/counter'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(counterApi)
  return app
}

describe('counterApi', () => {
  afterEach(() => {
    // tslint:disable-next-line: no-any
    (CONSTANTS as any).USE_SERVING_HOST_COUNTER = undefined;
    // tslint:disable-next-line: no-any
    (CONSTANTS as any).SERVING_HOST_COUNTER_URL = undefined
  })

  it('queries CONSTANTS.COUNTER by default', async () => {
    mockedAxios.get.mockResolvedValue({ data: { count: 1 }, status: 200 })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ count: 1 })
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.COUNTER}/stats/data/now`, expect.any(Object))
  })

  it('queries SERVING_HOST_COUNTER_URL when USE_SERVING_HOST_COUNTER is set', async () => {
    // tslint:disable-next-line: no-any
    (CONSTANTS as any).USE_SERVING_HOST_COUNTER = 'true';
    // tslint:disable-next-line: no-any
    (CONSTANTS as any).SERVING_HOST_COUNTER_URL = 'https://counter.example'
    mockedAxios.get.mockResolvedValue({ data: {}, status: 200 })
    await supertest(buildApp()).get('/')
    expect(mockedAxios.get).toHaveBeenCalledWith('https://counter.example/stats/data/now', expect.any(Object))
  })

  it('falls back to CONSTANTS.COUNTER when the flag is set without SERVING_HOST_COUNTER_URL', async () => {
    // tslint:disable-next-line: no-any
    (CONSTANTS as any).USE_SERVING_HOST_COUNTER = 'true'
    mockedAxios.get.mockResolvedValue({ data: {}, status: 200 })
    await supertest(buildApp()).get('/')
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.COUNTER}/stats/data/now`, expect.any(Object))
  })

  it('forwards the upstream error status/body when the request fails', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'boom' }, status: 503 } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(503)
    expect(res.body).toEqual({ error: 'boom' })
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
