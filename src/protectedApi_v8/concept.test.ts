jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { conceptGraphApi } from './concept'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(conceptGraphApi)
  return app
}

describe('conceptGraphApi GET /:ids', () => {
  it('returns the concept response for the given ids', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { response: [{ id: 'c1' }] } } })
    const res = await supertest(buildApp()).get('/c1,c2')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'c1' }])
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/concepts?ids=c1,c2`,
      expect.any(Object)
    )
  })

  it('falls back to a generic 500 error on failure', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/c1')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('conceptGraphApi POST /autocomplete', () => {
  it('forwards org/rootOrg headers and returns the upstream data', async () => {
    mockedAxios.post.mockResolvedValue({ data: ['a', 'b'] })
    const res = await supertest(buildApp())
      .post('/autocomplete')
      .set('org', 'dopt')
      .set('rootOrg', 'igot')
      .send({ q: 'x' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(['a', 'b'])
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.NODE_API_BASE}/post/autocomplete`,
      { q: 'x' },
      expect.objectContaining({ headers: expect.objectContaining({ org: 'dopt', rootOrg: 'igot' }) })
    )
  })

  it('forwards the upstream error status/body when the request fails', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).post('/autocomplete').send({})
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })
})
