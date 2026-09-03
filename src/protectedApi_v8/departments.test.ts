jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { deptApi } from './departments'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(deptApi)
  return app
}

describe('deptApi GET /getAllDept', () => {
  it('returns the upstream department list', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ name: 'DoPT' }], status: 200 })
    const res = await supertest(buildApp()).get('/getAllDept')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ name: 'DoPT' }])
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.SB_EXT_API_BASE_2}/portal/getAllDept`, expect.any(Object))
  })

  it('falls back to a generic 500 error on failure', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getAllDept')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('deptApi GET /searchDept', () => {
  it('searches departments by friendlyName', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ name: 'DoPT' }], status: 200 })
    const res = await supertest(buildApp()).get('/searchDept?friendlyName=dopt')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/portal/deptSearch?friendlyName=dopt'),
      expect.any(Object)
    )
  })

  it('forwards the upstream error status/body when the search fails', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad query' }, status: 400 } })
    const res = await supertest(buildApp()).get('/searchDept?friendlyName=x')
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'bad query' })
  })
})
