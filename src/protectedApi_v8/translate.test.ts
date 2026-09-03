jest.mock('axios', () => jest.fn())

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { translateApi } from './translate'

const mockedAxios = axios as unknown as jest.Mock

function buildApp() {
  const app = express()
  app.use(translateApi)
  return app
}

describe('translateApi', () => {
  it('fetches filter translations for the given language and forwards org headers', async () => {
    mockedAxios.mockResolvedValue({ data: { filters: [] } })
    const res = await supertest(buildApp()).get('/filterdata/hi').set('org', 'dopt').set('rootOrg', 'igot')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ filters: [] })
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ org: 'dopt', rootOrg: 'igot' }),
        method: 'GET',
        url: expect.stringContaining('/filters/hi'),
      })
    )
  })

  it('forwards the upstream error status/body when the request fails', async () => {
    mockedAxios.mockRejectedValue({ response: { data: { error: 'boom' }, status: 502 } })
    const res = await supertest(buildApp()).get('/filterdata/hi')
    expect(res.status).toBe(502)
    expect(res.body).toEqual({ error: 'boom' })
  })
})
