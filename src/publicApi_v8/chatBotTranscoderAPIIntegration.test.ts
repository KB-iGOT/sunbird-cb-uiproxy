jest.mock('axios')

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { chatBotTranscoderAPIIntegration } from './chatBotTranscoderAPIIntegration'

const mockedAxios = axios as jest.Mocked<typeof axios>

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/publicApi/v8/chatbot', chatBotTranscoderAPIIntegration)
  return app
}

describe('chatBotTranscoderAPIIntegration', () => {
  it('returns 400 when there is no Authorization header', async () => {
    const app = buildApp()
    const res = await supertest(app).get('/publicApi/v8/chatbot/foo')
    expect(res.status).toBe(400)
  })

  it('returns 400 when there is no user token header', async () => {
    const app = buildApp()
    const res = await supertest(app)
      .get('/publicApi/v8/chatbot/foo')
      .set('Authorization', 'Bearer token')
    expect(res.status).toBe(400)
  })

  it('proxies a GET request, strips br from headers, and forwards the response', async () => {
    // 'identity' (not a real compression) so supertest doesn't try to gunzip the plain body
    mockedAxios.get.mockResolvedValue({
      data: { ok: true },
      headers: { 'content-encoding': 'br, identity' },
      status: 200,
    })

    const app = buildApp()
    const res = await supertest(app)
      .get('/publicApi/v8/chatbot/foo/bar')
      .set('Authorization', 'Bearer token')
      .set('x-authenticated-user-token', 'user-token')
      .set('accept-encoding', 'br, identity')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true })
    expect(res.headers['content-encoding']).toBe('identity')

    // Bug: the router mounts the sub-handler at '/*', so req.baseUrl ends up equal to
    // req.originalUrl and removePrefix() strips the whole path, leaving an empty subPath
    // regardless of what was requested.
    const [calledUrl] = mockedAxios.get.mock.calls[0]
    expect(calledUrl).toBe(`${CONSTANTS.APP_FUEL_API_URL}/transcoder/`)
  })

  it('proxies a POST request with the request body', async () => {
    mockedAxios.post.mockResolvedValue({ data: { created: true }, headers: {}, status: 201 })

    const app = buildApp()
    const res = await supertest(app)
      .post('/publicApi/v8/chatbot/create')
      .set('Authorization', 'Bearer token')
      .set('x-authenticated-user-token', 'user-token')
      .send({ name: 'thing' })

    expect(res.status).toBe(201)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.APP_FUEL_API_URL}/transcoder/`,
      { name: 'thing' },
      expect.any(Object)
    )
  })

  it('proxies a PUT request', async () => {
    mockedAxios.put.mockResolvedValue({ data: {}, headers: {}, status: 200 })
    const app = buildApp()
    const res = await supertest(app)
      .put('/publicApi/v8/chatbot/update')
      .set('Authorization', 'Bearer token')
      .set('x-authenticated-user-token', 'user-token')
    expect(res.status).toBe(200)
    expect(mockedAxios.put).toHaveBeenCalled()
  })

  it('proxies a DELETE request', async () => {
    mockedAxios.delete.mockResolvedValue({ data: {}, headers: {}, status: 200 })
    const app = buildApp()
    const res = await supertest(app)
      .delete('/publicApi/v8/chatbot/remove')
      .set('Authorization', 'Bearer token')
      .set('x-authenticated-user-token', 'user-token')
    expect(res.status).toBe(200)
    expect(mockedAxios.delete).toHaveBeenCalled()
  })

  it('returns 405 for unsupported methods', async () => {
    const app = buildApp()
    const res = await supertest(app)
      .patch('/publicApi/v8/chatbot/nope')
      .set('Authorization', 'Bearer token')
      .set('x-authenticated-user-token', 'user-token')
    expect(res.status).toBe(405)
  })

  it('returns 500 when the upstream call throws', async () => {
    mockedAxios.get.mockRejectedValue(new Error('upstream down'))
    const app = buildApp()
    const res = await supertest(app)
      .get('/publicApi/v8/chatbot/foo')
      .set('Authorization', 'Bearer token')
      .set('x-authenticated-user-token', 'user-token')
    expect(res.status).toBe(500)
  })
})
