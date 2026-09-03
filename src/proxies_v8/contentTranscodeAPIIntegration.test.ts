jest.mock('axios', () => ({
  delete: jest.fn(),
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
}))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { contentTranscodeAPIIntegration } from './contentTranscodeAPIIntegration'

const mockedAxios = axios as unknown as {
  delete: jest.Mock
  get: jest.Mock
  post: jest.Mock
  put: jest.Mock
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/proxies/v8', contentTranscodeAPIIntegration)
  return app
}

describe('contentTranscodeAPIIntegration', () => {
  it('proxies a GET request to KONG and forwards status, headers and body', async () => {
    mockedAxios.get.mockResolvedValue({ data: { ok: true }, headers: { 'x-trace': '1' }, status: 200 })
    const res = await supertest(buildApp()).get('/proxies/v8/content/v3/read/do_1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(res.header['x-trace']).toBe('1')
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/content/v3/read/do_1`,
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: CONSTANTS.SB_API_KEY }) })
    )
  })

  it('returns 405 for an unsupported method', async () => {
    const res = await supertest(buildApp()).patch('/proxies/v8/content/v3/read/do_1')
    expect(res.status).toBe(405)
  })

  it('forwards the upstream error status/body when KONG responds with an error', async () => {
    mockedAxios.get.mockRejectedValue({
      response: { data: { error: 'not found' }, headers: {}, status: 404 },
    })
    const res = await supertest(buildApp()).get('/proxies/v8/content/v3/read/missing')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not found' })
  })

  it('returns 502 when KONG is unreachable', async () => {
    mockedAxios.get.mockRejectedValue(new Error('ECONNREFUSED'))
    const res = await supertest(buildApp()).get('/proxies/v8/content/v3/read/x')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'Bad Gateway: Could not reach KONG API' })
  })
})
