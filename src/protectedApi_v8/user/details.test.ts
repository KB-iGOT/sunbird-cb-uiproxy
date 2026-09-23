jest.mock('axios', () => ({ post: jest.fn() }))
jest.mock('../portal-v3', () => ({
  getRoles: jest.fn(),
  getUserStatus: jest.fn(),
}))
jest.mock('./profile-registry', () => ({
  getProfileStatus: jest.fn(),
}))
jest.mock('../discussionHub/users', () => ({
  getUserByEmail: jest.fn(),
}))
jest.mock('../discussionHub/writeApi', () => ({
  createDiscussionHubUser: jest.fn(),
}))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { getRoles, getUserStatus } from '../portal-v3'
import { detailsApi } from './details'
import { getProfileStatus } from './profile-registry'

const mockedAxios = axios as unknown as { post: jest.Mock }
const mockedGetRoles = getRoles as jest.Mock
const mockedGetUserStatus = getUserStatus as jest.Mock
const mockedGetProfileStatus = getProfileStatus as jest.Mock

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(detailsApi)
  return app
}

describe('detailsApi GET /', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(400)
  })

  it('aggregates roles, profile status and active status for the extracted userId', async () => {
    mockedGetRoles.mockResolvedValue(['ADMIN'])
    mockedGetProfileStatus.mockResolvedValue(true)
    mockedGetUserStatus.mockResolvedValue(true)

    const res = await supertest(buildApp()).get('/').set('org', 'dopt').set('rootOrg', 'igot')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      group: [], isActive: true, profileDetailsStatus: true, roles: ['ADMIN'], tncStatus: true,
    })
    expect(mockedGetRoles).toHaveBeenCalledWith('user-1')
  })

  it('returns 500 with the raw error when a lookup rejects', async () => {
    mockedGetRoles.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
  })
})

describe('detailsApi POST /managerDetails', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/managerDetails').send({})
    expect(res.status).toBe(400)
  })

  it('fetches manager details', async () => {
    mockedAxios.post.mockResolvedValue({ data: { manager: 'm1' }, status: 200 })
    const res = await supertest(buildApp()).post('/managerDetails').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.USER_PROFILE_API_BASE}/user`,
      {},
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })
})

describe('detailsApi POST /detailV1', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/detailV1').send({})
    expect(res.status).toBe(400)
  })

  it('looks up user details by email', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ email: 'a@b.com' }] })
    const res = await supertest(buildApp()).post('/detailV1').set('rootOrg', 'igot').send({ email: 'a@b.com' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.USER_PROFILE_API_BASE}/user/multi-fetch/email`,
      expect.objectContaining({ values: ['a@b.com'] }),
      expect.any(Object)
    )
  })
})

describe('detailsApi GET /detailV2', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/detailV2')
    expect(res.status).toBe(400)
  })

  it('looks up user details by the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ wid: 'user-1' }] })
    const res = await supertest(buildApp()).get('/detailV2').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.USER_PROFILE_API_BASE}/user/multi-fetch/wid`,
      expect.objectContaining({ values: ['user-1'] }),
      expect.any(Object)
    )
  })
})
