jest.mock('axios', () => jest.fn())

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { authSearch } from './authSearch'
import { DEFAULT_META } from './constants/default-meta'

const mockedAxios = axios as unknown as jest.Mock

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(authSearch)
  return app
}

describe('authSearch', () => {
  it('includes sourceFields in the body for /v6/ search routes', async () => {
    mockedAxios.mockResolvedValue({ data: { ok: true }, status: 200 })
    await supertest(buildApp()).post('/v6/search').send({ query: 'x' })

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ query: 'x', sourceFields: DEFAULT_META }),
        method: 'POST',
        url: `${CONSTANTS.SEARCH_API_BASE}/v6/search`,
      })
    )
  })

  it('strips sourceFields from the body for non /v6/ routes', async () => {
    mockedAxios.mockResolvedValue({ data: { ok: true }, status: 200 })
    await supertest(buildApp()).post('/v5/search').send({ query: 'x' })

    const [config] = mockedAxios.mock.calls[mockedAxios.mock.calls.length - 1]
    expect(config.data).toEqual({ query: 'x' })
  })

  it('forwards the upstream status and body on success', async () => {
    mockedAxios.mockResolvedValue({ data: { hits: 3 }, status: 200 })
    const res = await supertest(buildApp()).post('/v5/search').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ hits: 3 })
  })

  it('forwards the upstream error status and body on failure', async () => {
    mockedAxios.mockRejectedValue({ response: { data: { error: 'bad request' }, status: 400 } })
    const res = await supertest(buildApp()).post('/v5/search').send({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'bad request' })
  })
})
