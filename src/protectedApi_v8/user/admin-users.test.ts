jest.mock('axios', () => ({ request: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { usersApi } from './admin-users'

const mockedAxios = axios as unknown as { request: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(usersApi)
  return app
}

describe('usersApi POST /createuser', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/createuser?keycloak=true').send({})
    expect(res.status).toBe(400)
    expect(mockedAxios.request).not.toHaveBeenCalled()
  })

  it('creates the user with basic auth and the keycloak/rootOrg params', async () => {
    mockedAxios.request.mockResolvedValue({ data: { userId: 'user-1' } })
    const res = await supertest(buildApp()).post('/createuser?keycloak=true').set('rootOrg', 'igot').send({ name: 'Jane' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ userId: 'user-1' })
    expect(mockedAxios.request).toHaveBeenCalledWith(
      expect.objectContaining({
        auth: { password: CONSTANTS.USER_CREATE_PASSWORD, username: CONSTANTS.USER_CREATE_USERNAME },
        data: { name: 'Jane' },
        method: 'POST',
        params: { keycloakOnly: true, pidOnly: true, rootOrg: 'igot' },
        url: `${CONSTANTS.USER_CREATE_API_BASE}/users`,
      })
    )
  })

  it('falls back to a generic 500 error when the request fails', async () => {
    mockedAxios.request.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/createuser?keycloak=false').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
