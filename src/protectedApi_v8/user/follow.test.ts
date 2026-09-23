jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { followApi } from './follow'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(followApi)
  return app
}

describe('followApi POST /fetchAll', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).post('/fetchAll').send({})
    expect(res.status).toBe(400)
  })

  it('fetches all follow relations for the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ id: 'u2' }], status: 200 })
    const res = await supertest(buildApp()).post('/fetchAll').set('rootOrg', 'igot').set('org', 'dopt').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.NODE_API_BASE}/getAll`,
      expect.objectContaining({ org: 'dopt', rootOrg: 'igot', userid: 'user-1' }),
      expect.any(Object)
    )
  })
})

describe('followApi GET /followers/:targetId', () => {
  it('returns the followers for the given target', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'u2' }] })
    const res = await supertest(buildApp()).get('/followers/u2')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(`${CONSTANTS.NODE_API_BASE}/getFollowers/u2`, expect.any(Object))
  })

  it('falls back to the raw error on failure', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'boom' }, status: 404 } })
    const res = await supertest(buildApp()).get('/followers/missing')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'boom' })
  })
})

describe('followApi GET /following/:type', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).get('/following/all')
    expect(res.status).toBe(400)
  })

  it('fetches who the extracted userId is following', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ id: 'u2' }] })
    const res = await supertest(buildApp()).get('/following/all').set('rootOrg', 'igot').set('org', 'dopt')
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.NODE_API_BASE}/getfollowing`,
      expect.objectContaining({ type: 'all', userid: 'user-1' }),
      expect.any(Object)
    )
  })
})

describe('followApi GET /getFollowing', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).get('/getFollowing')
    expect(res.status).toBe(400)
  })

  it('uses the wid query param over the extracted userId when given', async () => {
    mockedAxios.post.mockResolvedValue({ data: [] })
    await supertest(buildApp()).get('/getFollowing?wid=other-user').set('rootOrg', 'igot').set('org', 'dopt')
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ userid: 'other-user' }),
      expect.any(Object)
    )
  })
})

describe('followApi POST /getFollowingv3', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).post('/getFollowingv3').send({})
    expect(res.status).toBe(400)
  })

  it('fetches v3 following data with isIntranet/isStandAlone query flags', async () => {
    mockedAxios.post.mockResolvedValue({ data: [] })
    await supertest(buildApp())
      .post('/getFollowingv3?isIntranet=true&isStandAlone=false')
      .set('rootOrg', 'igot')
      .set('org', 'dopt')
      .send({})
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining('isIntranet=true&isStandAlone=false'),
      expect.any(Object),
      expect.any(Object)
    )
  })
})

describe('followApi POST /getFollowersv3', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).post('/getFollowersv3').send({})
    expect(res.status).toBe(400)
  })

  it('fetches v3 followers data', async () => {
    mockedAxios.post.mockResolvedValue({ data: [] })
    const res = await supertest(buildApp()).post('/getFollowersv3').set('rootOrg', 'igot').set('org', 'dopt').send({})
    expect(res.status).toBe(200)
  })
})

describe('followApi POST /', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).post('/').send({})
    expect(res.status).toBe(400)
  })

  it('follows a user', async () => {
    mockedAxios.post.mockResolvedValue({ data: { followed: true }, status: 200 })
    const res = await supertest(buildApp()).post('/').set('rootOrg', 'igot').set('org', 'dopt').send({ target: 'u2' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.NODE_API_BASE}/follow`, expect.any(Object), expect.any(Object))
  })
})

describe('followApi POST /unfollow', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).post('/unfollow').send({})
    expect(res.status).toBe(400)
  })

  it('unfollows a user', async () => {
    mockedAxios.post.mockResolvedValue({ data: { unfollowed: true }, status: 200 })
    const res = await supertest(buildApp()).post('/unfollow').set('rootOrg', 'igot').set('org', 'dopt').send({ target: 'u2' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.NODE_API_BASE}/unfollow`, expect.any(Object), expect.any(Object))
  })
})

describe('followApi POST /getFollowers', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).post('/getFollowers').send({})
    expect(res.status).toBe(400)
  })

  it('fetches followers via POST', async () => {
    mockedAxios.post.mockResolvedValue({ data: [], status: 200 })
    const res = await supertest(buildApp()).post('/getFollowers').set('rootOrg', 'igot').set('org', 'dopt').send({})
    expect(res.status).toBe(200)
  })
})
