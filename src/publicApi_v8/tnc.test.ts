jest.mock('axios', () => jest.fn())

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { publicTnc } from './tnc'

const mockedAxios = axios as unknown as jest.Mock

function buildApp() {
  const app = express()
  app.use(publicTnc)
  return app
}

describe('publicTnc', () => {
  it('returns 400 when rootOrg or org headers are missing', async () => {
    const res = await supertest(buildApp()).get('/').set('org', 'dopt')
    expect(res.status).toBe(400)
    expect(mockedAxios).not.toHaveBeenCalled()
  })

  it('returns the upstream terms payload when both headers are present', async () => {
    mockedAxios.mockResolvedValue({ data: { version: '1.0' } })
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot').set('org', 'dopt')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ version: '1.0' })
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ langCode: 'en', org: 'dopt', rootOrg: 'igot' }),
        method: 'GET',
      })
    )
  })

  it('passes a locale query param through to the upstream call', async () => {
    mockedAxios.mockResolvedValue({ data: {} })
    await supertest(buildApp()).get('/?locale=hi').set('rootOrg', 'igot').set('org', 'dopt')
    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({ headers: expect.objectContaining({ langCode: 'hi' }) }))
  })

  it('forwards the upstream error status and body on failure', async () => {
    mockedAxios.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot').set('org', 'dopt')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })

  it('falls back to a 500 with a generic error when the failure has no response', async () => {
    mockedAxios.mockRejectedValue(new Error('network down'))
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot').set('org', 'dopt')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
