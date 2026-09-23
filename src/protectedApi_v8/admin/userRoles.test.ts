jest.mock('axios', () => jest.fn())

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { userRolesApi } from './userRoles'

const mockedAxios = axios as unknown as jest.Mock

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(userRolesApi)
  return app
}

describe('userRolesApi GET /getRolesDescription/:lang', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/getRolesDescription/en')
    expect(res.status).toBe(400)
  })

  it('fetches the roles description for the given language', async () => {
    mockedAxios.mockResolvedValue({ data: [{ role: 'ADMIN' }] })
    const res = await supertest(buildApp()).get('/getRolesDescription/en').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ role: 'ADMIN' }])
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ langCode: 'en', rootOrg: 'igot' }),
        url: `${CONSTANTS.ROLES_API_BASE}/v2/all-roles`,
      })
    )
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getRolesDescription/en').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('userRolesApi GET /allRoles', () => {
  it('fetches roles for the master user', async () => {
    mockedAxios.mockResolvedValue({ data: { roles: [] } })
    const res = await supertest(buildApp()).get('/allRoles').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('userid=masteruser') }))
  })

  it('returns an empty object when the upstream has no data', async () => {
    mockedAxios.mockResolvedValue({ data: undefined })
    const res = await supertest(buildApp()).get('/allRoles')
    expect(res.body).toEqual({})
  })
})

describe('userRolesApi GET /:id', () => {
  it('fetches roles for the given user id', async () => {
    mockedAxios.mockResolvedValue({ data: { roles: ['ADMIN'] } })
    const res = await supertest(buildApp()).get('/user-1')
    expect(res.status).toBe(200)
    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({ url: expect.stringContaining('userid=user-1') }))
  })
})

describe('userRolesApi PATCH /', () => {
  it('updates roles', async () => {
    mockedAxios.mockResolvedValue({ data: { updated: true } })
    const res = await supertest(buildApp()).patch('/').send({ roles: ['ADMIN'] })
    expect(res.status).toBe(200)
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ data: { roles: ['ADMIN'] }, method: 'PATCH', url: `${CONSTANTS.ROLES_API_BASE}/v1/update/roles` })
    )
  })

  it('falls back to a generic 500 error when the update fails', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).patch('/').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
