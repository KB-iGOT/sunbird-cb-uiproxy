jest.mock('axios', () => ({ get: jest.fn(), request: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { topicApi } from './topic'

const mockedAxios = axios as unknown as { get: jest.Mock; request: jest.Mock }

function buildApp() {
  const app = express()
  app.use(topicApi)
  return app
}

describe('topicApi GET /recommend', () => {
  it('maps the recommended topics response', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { result: { response: { topics: [{ 'concepts.name': 'Java', count: 5, id: 't1' }] } } },
    })
    const res = await supertest(buildApp()).get('/recommend')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ count: 5, id: 't1', name: 'Java' }])
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.SB_EXT_API_BASE}/v1/topics/recommended?q=new`)
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/recommend')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('topicApi GET /autocomplete', () => {
  it('queries elasticsearch with the given prefix using ES basic auth', async () => {
    mockedAxios.request.mockResolvedValue({ data: { suggest: [] } })
    const res = await supertest(buildApp()).get('/autocomplete?q=ja')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ suggest: [] })
    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { password: CONSTANTS.ES_PASSWORD, username: CONSTANTS.ES_USERNAME },
        method: 'POST',
        url: `${CONSTANTS.ES_BASE}/lex_topic/_search`,
      })
    )
  })

  it('falls back to a generic 500 error when the search fails', async () => {
    mockedAxios.request.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/autocomplete?q=ja')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
