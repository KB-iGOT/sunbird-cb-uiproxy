jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { workallocationPublic } from './workallocationPublic'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(workallocationPublic)
  return app
}

describe('workallocationPublic', () => {
  it('redirects to the upstream PDF url on success', async () => {
    mockedAxios.get.mockResolvedValue({ data: 'https://cdn.example.com/wa.pdf' })
    const res = await supertest(buildApp()).get('/getWaPdf/wa-123')
    expect(res.status).toBe(302)
    expect(res.header.location).toBe('https://cdn.example.com/wa.pdf')
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining('/getWOPublishedPdf/wa-123'), expect.any(Object))
  })

  it('responds with the upstream error status and body when the request fails', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'not found' }, status: 404 } })
    const res = await supertest(buildApp()).get('/getWaPdf/missing')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'not found' })
  })

  it('falls back to a 500 with a generic error when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('network down'))
    const res = await supertest(buildApp()).get('/getWaPdf/x')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
