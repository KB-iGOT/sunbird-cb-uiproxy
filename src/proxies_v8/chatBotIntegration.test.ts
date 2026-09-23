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
import { chatBotIntegrationAPI } from './chatBotIntegration'

const mockedAxios = axios as unknown as {
  delete: jest.Mock
  get: jest.Mock
  post: jest.Mock
  put: jest.Mock
}

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/proxies/v8/chatbot/v3', chatBotIntegrationAPI)
  return app
}

describe('chatBotIntegrationAPI', () => {
  it('proxies a GET request to the tenant chatbot API and forwards the response', async () => {
    mockedAxios.get.mockResolvedValue({ data: { ok: true }, status: 200 })
    const res = await supertest(buildApp()).get('/proxies/v8/chatbot/v3/sessions/1')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.APP_FUEL_API_URL}/sessions/1`, expect.any(Object))
  })

  it('proxies a POST request with the request body', async () => {
    mockedAxios.post.mockResolvedValue({ data: { created: true }, status: 201 })
    const res = await supertest(buildApp()).post('/proxies/v8/chatbot/v3/sessions').send({ a: 1 })

    expect(res.status).toBe(201)
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.APP_FUEL_API_URL}/sessions`, { a: 1 }, expect.any(Object))
  })

  it('returns 405 for an unsupported method', async () => {
    const res = await supertest(buildApp()).patch('/proxies/v8/chatbot/v3/sessions/1')
    expect(res.status).toBe(405)
  })

  it('returns 500 when the upstream call fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('upstream down'))
    const res = await supertest(buildApp()).get('/proxies/v8/chatbot/v3/sessions/1')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed to fetch data from chatbot API' })
  })
})
