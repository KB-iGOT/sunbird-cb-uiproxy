jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { userTokenApi } from './token'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(userTokenApi)
  return app
}

describe('userTokenApi', () => {
  it('exchanges an email for a token', async () => {
    mockedAxios.get.mockResolvedValue({ data: { token: 'tok-1' }, status: 200 })
    const res = await supertest(buildApp()).get('/?email=a@b.com')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.CONTENT_API_BASE}/access-token?email=a@b.com`,
      expect.any(Object)
    )
  })

  it('exchanges a code and redirectUrl for a token', async () => {
    mockedAxios.get.mockResolvedValue({ data: { token: 'tok-2' }, status: 200 })
    await supertest(buildApp()).get('/?code=abc&redirectUrl=https://app.example.com')
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.CONTENT_API_BASE}/user-access-token?code=abc&redirecturi=https://app.example.com`,
      expect.any(Object)
    )
  })

  it('returns 400 when neither email nor code+redirectUrl are given', async () => {
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(400)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('forwards the upstream error status/body on failure', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 401 } })
    const res = await supertest(buildApp()).get('/?email=a@b.com')
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: 'bad' })
  })
})
