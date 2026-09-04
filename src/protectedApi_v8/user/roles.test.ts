jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.get = jest.fn()
  fn.post = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { getUserRoles, rolesApi } from './roles'

const mockedAxios = axios as unknown as jest.Mock & { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(rolesApi)
  return app
}

describe('getUserRoles', () => {
  it('returns the upstream roles on success', async () => {
    mockedAxios.get.mockResolvedValue({ data: ['ADMIN'] })
    expect(await getUserRoles('user-1', 'igot')).toEqual(['ADMIN'])
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.ROLES_API_BASE}/v2/users/user-1/roles`,
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })

  it('defaults to ["author"] when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    expect(await getUserRoles('user-1', 'igot')).toEqual(['author'])
  })
})

describe('rolesApi GET /', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(400)
  })

  it('returns roles for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: ['ADMIN'] })
    const res = await supertest(buildApp()).get('/').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual(['ADMIN'])
  })
})

describe('rolesApi GET /allRoles', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/allRoles')
    expect(res.status).toBe(400)
  })

  it('fetches roles for the master user', async () => {
    mockedAxios.get.mockResolvedValue({ data: ['ADMIN'] })
    const res = await supertest(buildApp()).get('/allRoles').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.ROLES_API_BASE}/v2/users/masteruser/roles`,
      expect.any(Object)
    )
  })
})

describe('rolesApi GET /:userId', () => {
  it('fetches roles for the given userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: ['ADMIN'] })
    const res = await supertest(buildApp()).get('/other-user').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.ROLES_API_BASE}/v2/users/other-user/roles`,
      expect.any(Object)
    )
  })
})

describe('rolesApi PATCH /', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).patch('/').send({})
    expect(res.status).toBe(400)
  })

  it('updates roles', async () => {
    mockedAxios.mockResolvedValue({ data: { updated: true } })
    const res = await supertest(buildApp()).patch('/').set('rootOrg', 'igot').send({ roles: ['ADMIN'] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ updated: true })
  })
})

describe('rolesApi GET /getRolesV2/:userId', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/getRolesV2/user-1')
    expect(res.status).toBe(400)
  })

  it('returns roles for the given userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: ['ADMIN'] })
    const res = await supertest(buildApp()).get('/getRolesV2/user-1').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
  })
})

describe('rolesApi GET /getUsersV2/:role', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/getUsersV2/ADMIN')
    expect(res.status).toBe(400)
  })

  it('returns the users with the given role', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'u1' }] })
    const res = await supertest(buildApp()).get('/getUsersV2/ADMIN').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.ROLES_API_BASE}/v2/roles/ADMIN/users`, expect.any(Object))
  })
})

describe('rolesApi POST /updateRolesV2', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/updateRolesV2').send({})
    expect(res.status).toBe(400)
  })

  it('updates roles v2, tagging the request with the wid header', async () => {
    mockedAxios.post.mockResolvedValue({ data: { updated: true } })
    const res = await supertest(buildApp()).post('/updateRolesV2').set('rootOrg', 'igot').set('wid', 'admin-1').send({ roles: [] })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.ROLES_API_BASE}/v2/roles`,
      expect.objectContaining({ action_by: 'admin-1', roles: [] }),
      expect.any(Object)
    )
  })
})
