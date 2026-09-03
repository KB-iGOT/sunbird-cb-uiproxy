jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { contentAssignApi } from './content-assign'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(contentAssignApi)
  return app
}

describe('contentAssignApi POST /searchUsers', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/searchUsers').send({})
    expect(res.status).toBe(400)
  })

  it('searches users', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ id: 'u1' }], status: 200 })
    const res = await supertest(buildApp()).post('/searchUsers').set('rootOrg', 'igot').send({ q: 'x' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_2}/v1/user-search`,
      { q: 'x' },
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })
})

describe('contentAssignApi POST /assignContent', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/assignContent').send({})
    expect(res.status).toBe(400)
  })

  it('assigns content', async () => {
    mockedAxios.post.mockResolvedValue({ data: { assigned: true }, status: 200 })
    const res = await supertest(buildApp()).post('/assignContent').set('rootOrg', 'igot').set('org', 'dopt').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_2}/v1/assign-content`,
      {},
      expect.objectContaining({ headers: { org: 'dopt', rootOrg: 'igot' } })
    )
  })
})

describe('contentAssignApi GET /getAdminLevel', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/getAdminLevel')
    expect(res.status).toBe(400)
  })

  it('fetches the admin level for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: { level: 1 }, status: 200 })
    const res = await supertest(buildApp()).get('/getAdminLevel').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_2}/v1/users/user-1/admin-level`,
      expect.any(Object)
    )
  })
})

describe('contentAssignApi GET /getAssignments', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/getAssignments')
    expect(res.status).toBe(400)
  })

  it('fetches assignments filtered by type', async () => {
    mockedAxios.get.mockResolvedValue({ data: [], status: 200 })
    const res = await supertest(buildApp()).get('/getAssignments?assignmentType=review').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('/v1/content-assignee/user-1/content-assignments?assignmentType=review'),
      expect.any(Object)
    )
  })
})
