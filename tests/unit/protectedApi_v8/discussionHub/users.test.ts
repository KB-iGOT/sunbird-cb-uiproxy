jest.mock('axios')
jest.mock('../../../../src/utils/discussionHub-helper', () => ({
  getUserSlug: jest.fn(),
  getUserUIDBySession: jest.fn(),
}))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { axiosRequestConfig } from '../../../../src/configs/request.config'
import { getUserSlug, getUserUIDBySession } from '../../../../src/utils/discussionHub-helper'
import { getUserByEmail, getUserByUsername, usersApi } from '../../../../src/protectedApi_v8/discussionHub/users'
import { CONSTANTS } from '../../../../src/utils/env'

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedGetUserSlug = getUserSlug as jest.Mock
const mockedGetUserUIDBySession = getUserUIDBySession as jest.Mock

function buildApp() {
  const app = express()
  app.use('/users', usersApi)
  return app
}

beforeEach(() => {
  mockedGetUserUIDBySession.mockResolvedValue(7)
  mockedGetUserSlug.mockResolvedValue('john-doe')
})

describe('usersApi', () => {
  it('GET /:slug/bookmarks returns the user bookmarks', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'b1' }] })
    const res = await supertest(buildApp()).get('/users/john-doe/bookmarks')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'b1' }])
    expect(mockedAxios.get.mock.calls[0][0]).toContain('/john-doe/bookmarks?_uid=7')
  })

  it('GET /:slug/bookmarks returns the upstream error on failure', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
    const res = await supertest(buildApp()).get('/users/john-doe/bookmarks')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'bad' })
  })

  it('GET /:slug/downvoted returns downvoted posts', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'd1' }] })
    const res = await supertest(buildApp()).get('/users/john-doe/downvoted')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'd1' }])
  })

  it('GET /:slug/groups returns the user groups', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'g1' }] })
    const res = await supertest(buildApp()).get('/users/john-doe/groups')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'g1' }])
  })

  it('GET /:slug/info returns user info', async () => {
    mockedAxios.get.mockResolvedValue({ data: { bio: 'hi' } })
    const res = await supertest(buildApp()).get('/users/john-doe/info')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ bio: 'hi' })
  })

  it('GET /me resolves the current user via getUserSlug then fetches the profile', async () => {
    mockedAxios.get.mockResolvedValue({ data: { slug: 'john-doe' } })
    const res = await supertest(buildApp()).get('/users/me').set('wid', 'user-1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ slug: 'john-doe' })
    expect(mockedGetUserSlug).toHaveBeenCalledWith(expect.anything(), 'user-1')
  })

  it('GET /:slug/posts returns the user posts', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'p1' }] })
    const res = await supertest(buildApp()).get('/users/john-doe/posts')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'p1' }])
  })

  it('GET /:slug/upvoted returns upvoted posts', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'u1' }] })
    const res = await supertest(buildApp()).get('/users/john-doe/upvoted')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'u1' }])
  })

  it('GET /:slug/watched returns watched topics', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'w1' }] })
    const res = await supertest(buildApp()).get('/users/john-doe/watched')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ id: 'w1' }])
  })

  it('GET /email/:email delegates to the exported getUserByEmail helper', async () => {
    mockedAxios.get.mockResolvedValue({ data: { email: 'a@b.com' } })
    const res = await supertest(buildApp()).get('/users/email/a@b.com')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ email: 'a@b.com' })
  })

  it('GET /:slug/about returns the user profile without a rootOrg header', async () => {
    mockedAxios.get.mockResolvedValue({ data: { about: 'me' } })
    const res = await supertest(buildApp()).get('/users/john-doe/about')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ about: 'me' })
  })
})

describe('getUserByEmail', () => {
  it('resolves with the axios response on success', async () => {
    mockedAxios.get.mockResolvedValue({ data: { email: 'a@b.com' } })
    const req = { header: () => undefined, kauth: undefined } as never
    const response = await getUserByEmail(req, 'a@b.com')
    expect(response.data).toEqual({ email: 'a@b.com' })
  })

  it('rejects when the axios call fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const req = { header: () => undefined, kauth: undefined } as never
    await expect(getUserByEmail(req, 'a@b.com')).rejects.toThrow('down')
  })
})

describe('getUserByUsername', () => {
  it('resolves with response.data on success', async () => {
    mockedAxios.get.mockResolvedValue({ data: { userslug: 'john-doe' } })
    const req = { header: () => undefined, kauth: undefined } as never
    const data = await getUserByUsername(req, 'john-doe')
    expect(data).toEqual({ userslug: 'john-doe' })
  })

  it('rejects when the axios call fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const req = { header: () => undefined, kauth: undefined } as never
    await expect(getUserByUsername(req, 'john-doe')).rejects.toThrow('down')
  })
})

describe('usersApi upstream requests', () => {
  const KONG = CONSTANTS.KONG_API_BASE
  const tokenHeaders = { Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' }

  function buildAuthedApp() {
    const app = express()
    app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
      req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
      next()
    })
    app.use('/users', usersApi)
    return app
  }

  const slugRoutes = [
    { path: '/john-doe/bookmarks', url: `${KONG}/nodebb/auth/api/user/john-doe/bookmarks?_uid=7` },
    { path: '/john-doe/downvoted', url: `${KONG}/nodebb/auth/api/user/john-doe/downvoted?_uid=7` },
    { path: '/john-doe/groups', url: `${KONG}/nodebb/auth/api/user/john-doe/groups?_uid=7` },
    { path: '/john-doe/info', url: `${KONG}/nodebb/auth/api/user/john-doe/info?_uid=7` },
    { path: '/me', url: `${KONG}/nodebb/auth/api/user/me-slug?_uid=7` },
    { path: '/john-doe/posts', url: `${KONG}/nodebb/auth/api/user/john-doe/posts?_uid=7` },
    { path: '/john-doe/upvoted', url: `${KONG}/nodebb/auth/api/user/john-doe/upvoted?_uid=7` },
    { path: '/john-doe/watched', url: `${KONG}/nodebb/auth/api/user/john-doe/watched?_uid=7` },
  ]

  beforeEach(() => {
    mockedAxios.get.mockReset()
    mockedGetUserSlug.mockResolvedValue('me-slug')
  })

  slugRoutes.forEach(({ path, url }) => {
    describe(path, () => {
      it('calls the NodeBB url with the session uid and the rootOrg header', async () => {
        mockedAxios.get.mockResolvedValue({ data: { ok: path }, status: 201 })
        const res = await supertest(buildAuthedApp()).get(`/users${path}`).set('rootOrg', 'igot')
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: path })
        expect(mockedAxios.get).toHaveBeenCalledTimes(1)
        expect(mockedAxios.get).toHaveBeenCalledWith(url, expect.anything())
        expect(mockedAxios.get.mock.calls[0][1]).toStrictEqual({
          ...axiosRequestConfig,
          headers: { ...tokenHeaders, rootOrg: 'igot' },
        })
      })

      it('defaults the rootOrg header to iGOT', async () => {
        mockedAxios.get.mockResolvedValue({ data: {} })
        await supertest(buildAuthedApp()).get(`/users${path}`)
        // tslint:disable-next-line: no-any
        expect((mockedAxios.get.mock.calls[0][1] as any).headers.rootOrg).toBe('iGOT')
      })

      it('forwards the upstream error status and body', async () => {
        mockedAxios.get.mockRejectedValue({ response: { data: { error: 'bad' }, status: 403 } })
        const res = await supertest(buildAuthedApp()).get(`/users${path}`)
        expect(res.status).toBe(403)
        expect(res.body).toEqual({ error: 'bad' })
      })

      it('falls back to 500 with an empty body', async () => {
        mockedAxios.get.mockRejectedValue(new Error('down'))
        const res = await supertest(buildAuthedApp()).get(`/users${path}`)
        expect(res.status).toBe(500)
        expect(res.body).toEqual({})
      })

      it('returns 500 when resolving the session uid fails', async () => {
        mockedGetUserUIDBySession.mockRejectedValue(new Error('no uid'))
        const res = await supertest(buildAuthedApp()).get(`/users${path}`)
        expect(res.status).toBe(500)
        expect(res.body).toEqual({})
        expect(mockedAxios.get).not.toHaveBeenCalled()
      })
    })
  })

  it('GET /me resolves the slug before the session uid', async () => {
    const calls: string[] = []
    mockedGetUserSlug.mockImplementation(async () => { calls.push('slug'); return 'me-slug' })
    mockedGetUserUIDBySession.mockImplementation(async () => { calls.push('uid'); return 7 })
    mockedAxios.get.mockResolvedValue({ data: {} })
    await supertest(buildAuthedApp()).get('/users/me')
    expect(calls).toEqual(['slug', 'uid'])
  })

  it('GET /:slug/about sends no rootOrg header', async () => {
    mockedAxios.get.mockResolvedValue({ data: { about: 'me' } })
    const res = await supertest(buildAuthedApp()).get('/users/john-doe/about').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(`${KONG}/nodebb/auth/api/user/john-doe?_uid=7`, expect.anything())
    expect(mockedAxios.get.mock.calls[0][1]).toStrictEqual({ ...axiosRequestConfig, headers: tokenHeaders })
  })

  it('GET /:slug/about forwards the upstream error and falls back to 500 {}', async () => {
    mockedAxios.get.mockRejectedValueOnce({ response: { data: { error: 'bad' }, status: 404 } })
    let res = await supertest(buildAuthedApp()).get('/users/john-doe/about')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'bad' })
    mockedAxios.get.mockRejectedValueOnce(new Error('down'))
    res = await supertest(buildAuthedApp()).get('/users/john-doe/about')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({})
  })

  it('GET /email/:email calls the email lookup without rootOrg and relays errors', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { email: 'a@b.com' } })
    let res = await supertest(buildAuthedApp()).get('/users/email/a@b.com')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(`${KONG}/nodebb/api/user/email/a@b.com`, expect.anything())
    expect(mockedAxios.get.mock.calls[0][1]).toStrictEqual({ ...axiosRequestConfig, headers: tokenHeaders })
    mockedAxios.get.mockRejectedValueOnce({ response: { data: { error: 'nf' }, status: 404 } })
    res = await supertest(buildAuthedApp()).get('/users/email/a@b.com')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'nf' })
    mockedAxios.get.mockRejectedValueOnce(new Error('down'))
    res = await supertest(buildAuthedApp()).get('/users/email/a@b.com')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({})
  })

  it('getUserByUsername calls the username url with the token headers', async () => {
    mockedAxios.get.mockResolvedValue({ data: { userslug: 'x' } })
    const req = { kauth: { grant: { access_token: { token: 'tok' } } } } as never
    await getUserByUsername(req, 'x')
    expect(mockedAxios.get).toHaveBeenCalledWith(`${KONG}/api/user/username/x`, expect.anything())
    expect(mockedAxios.get.mock.calls[0][1]).toStrictEqual({ ...axiosRequestConfig, headers: tokenHeaders })
  })
})
