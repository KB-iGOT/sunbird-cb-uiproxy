jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { viewProfileApi } from './viewprofile'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(viewProfileApi)
  return app
}

describe('viewProfileApi', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/user-1').set('org', 'dopt')
    expect(res.status).toBe(400)
    expect(mockedAxios.get).not.toHaveBeenCalled()
  })

  it('fetches the profile for the given wid when rootOrg is present', async () => {
    mockedAxios.get.mockResolvedValue({ data: { name: 'Jane' }, status: 200 })
    const res = await supertest(buildApp()).get('/user-1').set('rootOrg', 'igot').set('org', 'dopt')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ name: 'Jane' })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.NODE_API_BASE}/userprofiles/pathfinders/viewprofile`,
      expect.objectContaining({
        headers: expect.objectContaining({ org: 'dopt', rootOrg: 'igot', userId: 'user-1', wid: 'user-1' }),
      })
    )
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/user-1').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
