jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { userGroupApi } from './group'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(userGroupApi)
  return app
}

describe('userGroupApi GET /groupContent', () => {
  it('searches v6 content scoped to the user\'s group labels', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ group_id: 'g1' }, { group_id: 'g2' }] })
    mockedAxios.post.mockResolvedValue({ data: { result: [{ id: 'c1' }] } })

    const res = await supertest(buildApp()).get('/groupContent').set('rootOrg', 'igot')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ contents: [{ id: 'c1' }] })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/v6/search`,
      expect.objectContaining({
        filters: [{ andFilters: [{ labels: ['g1', 'g2'] }] }],
        pageSize: 50,
        rootOrg: 'igot',
        uuid: 'user-1',
      }),
      expect.any(Object)
    )
  })

  it('falls back to a generic 500 error when the search fails', async () => {
    mockedAxios.get.mockResolvedValue({ data: [] })
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/groupContent')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('userGroupApi GET /fetchUserGroup', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/fetchUserGroup')
    expect(res.status).toBe(400)
  })

  it('fetches groups for the extracted userId', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ group_id: 'g1' }], status: 200 })
    const res = await supertest(buildApp()).get('/fetchUserGroup').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ group_id: 'g1' }])
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.USER_PROFILE_API_BASE}/user/user-1/groups`)
  })

  it('uses the userId query param when given', async () => {
    mockedAxios.get.mockResolvedValue({ data: [], status: 200 })
    await supertest(buildApp()).get('/fetchUserGroup?userId=other-user').set('rootOrg', 'igot')
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.USER_PROFILE_API_BASE}/user/other-user/groups`)
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/fetchUserGroup').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
