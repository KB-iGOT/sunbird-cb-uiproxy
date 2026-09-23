jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { emailApi } from './email'

const mockedAxios = axios as unknown as { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(emailApi)
  return app
}

describe('emailApi', () => {
  it('sends the email text payload and forwards the upstream response', async () => {
    mockedAxios.post.mockResolvedValue({ data: { sent: true }, status: 200 })
    const res = await supertest(buildApp()).post('/emailText').send({ to: 'a@b.com' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ sent: true })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/v1/Notification/Send/Text`,
      { to: 'a@b.com' },
      expect.any(Object)
    )
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).post('/emailText').send({})
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/emailText').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
