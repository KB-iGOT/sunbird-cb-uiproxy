jest.mock('axios')
jest.mock('../../../../src/utils/discussionHub-helper', () => ({
  getUserUIDBySession: jest.fn(),
  getWriteApiAdminUID: jest.fn(),
}))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { axiosRequestConfig } from '../../../../src/configs/request.config'
import { getUserUIDBySession, getWriteApiAdminUID } from '../../../../src/utils/discussionHub-helper'
import { createDiscussionHubUser, writeApi } from '../../../../src/protectedApi_v8/discussionHub/writeApi'
import { CONSTANTS } from '../../../../src/utils/env'

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedGetUserUIDBySession = getUserUIDBySession as jest.Mock
const mockedGetWriteApiAdminUID = getWriteApiAdminUID as jest.Mock

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/writeApi', writeApi)
  return app
}

beforeEach(() => {
  mockedGetUserUIDBySession.mockResolvedValue(42)
  mockedGetWriteApiAdminUID.mockReturnValue(1)
})

describe('writeApi', () => {
  it('POST /topics creates a topic', async () => {
    mockedAxios.post.mockResolvedValue({ data: { tid: 't1' } })
    const res = await supertest(buildApp()).post('/writeApi/topics').send({ title: 'Hello' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tid: 't1' })
    expect(mockedAxios.post.mock.calls[0][1]).toMatchObject({ title: 'Hello', _uid: 42 })
  })

  it('POST /topics returns the upstream error on failure', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: { error: 'bad' }, status: 400 } })
    const res = await supertest(buildApp()).post('/writeApi/topics').send({})
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: 'bad' })
  })

  it('POST /topics/:topicId replies to a topic', async () => {
    mockedAxios.post.mockResolvedValue({ data: { pid: 'p1' } })
    const res = await supertest(buildApp()).post('/writeApi/topics/t1').send({ content: 'reply' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ pid: 'p1' })
  })

  it('POST /users creates a discussion hub user', async () => {
    mockedAxios.post.mockResolvedValue({ data: { uid: 99 } })
    const res = await supertest(buildApp()).post('/writeApi/users').send({ username: 'bob' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ uid: 99 })
  })

  it('POST /users returns 500 when the create call fails', async () => {
    mockedAxios.post.mockRejectedValue({ response: { data: { error: 'bad' }, status: 500 } })
    const res = await supertest(buildApp()).post('/writeApi/users').send({})
    expect(res.status).toBe(500)
  })

  it('POST /posts/:postId/bookmark bookmarks a post', async () => {
    mockedAxios.post.mockResolvedValue({ data: { bookmarked: true } })
    const res = await supertest(buildApp()).post('/writeApi/posts/p1/bookmark').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ bookmarked: true })
  })

  it('DELETE /posts/:postId/bookmark removes a bookmark', async () => {
    mockedAxios.delete.mockResolvedValue({ data: { bookmarked: false } })
    const res = await supertest(buildApp()).delete('/writeApi/posts/p1/bookmark')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ bookmarked: false })
  })

  it('POST /posts/:postId/vote votes on a post', async () => {
    mockedAxios.post.mockResolvedValue({ data: { voted: true } })
    const res = await supertest(buildApp()).post('/writeApi/posts/p1/vote').send({ delta: 1 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ voted: true })
  })

  it('DELETE /posts/:postId/vote removes a vote', async () => {
    mockedAxios.delete.mockResolvedValue({ data: { voted: false } })
    const res = await supertest(buildApp()).delete('/writeApi/posts/p1/vote')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ voted: false })
  })

  it('PUT /topics/:topicId/follow follows a topic', async () => {
    mockedAxios.put.mockResolvedValue({ data: { following: true } })
    const res = await supertest(buildApp()).put('/writeApi/topics/t1/follow').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ following: true })
  })

  it('PUT /topics/:topicId/tags updates tags', async () => {
    mockedAxios.put.mockResolvedValue({ data: { tags: ['a'] } })
    const res = await supertest(buildApp()).put('/writeApi/topics/t1/tags').send({ tags: ['a'] })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ tags: ['a'] })
  })
})

describe('createDiscussionHubUser', () => {
  it('resolves with the axios response on success', async () => {
    mockedAxios.post.mockResolvedValue({ data: { uid: 5 } })
    const req = { header: () => undefined, kauth: undefined } as never
    const response = await createDiscussionHubUser(req, { username: 'x' })
    expect(response.data).toEqual({ uid: 5 })
  })

  it('rejects when the axios call fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const req = { header: () => undefined, kauth: undefined } as never
    await expect(createDiscussionHubUser(req, { username: 'x' })).rejects.toThrow('down')
  })
})

describe('writeApi upstream requests', () => {
  const V2 = `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/v2`
  const expectedConfig = {
    ...axiosRequestConfig,
    headers: { Authorization: CONSTANTS.SB_API_KEY, 'x-authenticated-user-token': 'tok' },
  }

  function buildAuthedApp() {
    const app = express()
    app.use(express.json())
    app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
      req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
      next()
    })
    app.use('/writeApi', writeApi)
    return app
  }

  const bodyRoutes: Array<{ method: 'post' | 'put', path: string, url: string, body: object, usesUid: boolean }> = [
    { method: 'post', path: '/topics', url: `${V2}/topics`, body: { title: 'T', _uid: 42 }, usesUid: true },
    { method: 'post', path: '/topics/t1', url: `${V2}/topics/t1`, body: { title: 'T', _uid: 42 }, usesUid: true },
    { method: 'post', path: '/posts/p1/bookmark', url: `${V2}/posts/p1/bookmark`, body: { _uid: 42 }, usesUid: true },
    { method: 'post', path: '/posts/p1/vote', url: `${V2}/posts/p1/vote`, body: { title: 'T', _uid: 42 }, usesUid: true },
    { method: 'put', path: '/topics/t1/follow', url: `${V2}/topics/t1/follow`, body: { _uid: 42 }, usesUid: true },
    { method: 'put', path: '/topics/t1/tags', url: `${V2}/topics/t1/tags`, body: { title: 'T' }, usesUid: false },
  ]

  const deleteRoutes = [
    { path: '/posts/p1/bookmark', url: `${V2}/posts/p1/bookmark?_uid=42` },
    { path: '/posts/p1/vote', url: `${V2}/posts/p1/vote?_uid=42` },
  ]

  beforeEach(() => {
    mockedAxios.post.mockReset()
    mockedAxios.put.mockReset()
    mockedAxios.delete.mockReset()
    mockedGetUserUIDBySession.mockClear()
  })

  bodyRoutes.forEach(({ method, path, url, body, usesUid }) => {
    describe(`${method.toUpperCase()} ${path}`, () => {
      it('sends the expected url, body and headers', async () => {
        mockedAxios[method].mockResolvedValue({ data: { ok: path }, status: 201 })
        const res = await supertest(buildAuthedApp())[method](`/writeApi${path}`).send({ title: 'T', _uid: 1 })
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: path })
        expect(mockedAxios[method]).toHaveBeenCalledTimes(1)
        expect(mockedAxios[method].mock.calls[0][0]).toBe(url)
        expect(mockedAxios[method].mock.calls[0][1]).toStrictEqual(usesUid ? body : { title: 'T', _uid: 1 })
        expect(mockedAxios[method].mock.calls[0][2]).toStrictEqual(expectedConfig)
        expect(mockedGetUserUIDBySession).toHaveBeenCalledTimes(usesUid ? 1 : 0)
      })

      it('forwards the upstream error status and body', async () => {
        mockedAxios[method].mockRejectedValue({ response: { data: { error: 'bad' }, status: 409 } })
        const res = await supertest(buildAuthedApp())[method](`/writeApi${path}`).send({})
        expect(res.status).toBe(409)
        expect(res.body).toEqual({ error: 'bad' })
      })

      it('falls back to 500 with an empty body', async () => {
        mockedAxios[method].mockRejectedValue(new Error('down'))
        const res = await supertest(buildAuthedApp())[method](`/writeApi${path}`).send({})
        expect(res.status).toBe(500)
        expect(res.body).toEqual({})
      })
    })
  })

  deleteRoutes.forEach(({ path, url }) => {
    describe(`DELETE ${path}`, () => {
      it('sends the uid as a query parameter with the token headers', async () => {
        mockedAxios.delete.mockResolvedValue({ data: { ok: path } })
        const res = await supertest(buildAuthedApp()).delete(`/writeApi${path}`)
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ ok: path })
        expect(mockedAxios.delete).toHaveBeenCalledTimes(1)
        expect(mockedAxios.delete.mock.calls[0][0]).toBe(url)
        expect(mockedAxios.delete.mock.calls[0][1]).toStrictEqual(expectedConfig)
      })

      it('forwards the upstream error status and body', async () => {
        mockedAxios.delete.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
        const res = await supertest(buildAuthedApp()).delete(`/writeApi${path}`)
        expect(res.status).toBe(404)
        expect(res.body).toEqual({ error: 'bad' })
      })

      it('falls back to 500 with an empty body', async () => {
        mockedAxios.delete.mockRejectedValue(new Error('down'))
        const res = await supertest(buildAuthedApp()).delete(`/writeApi${path}`)
        expect(res.status).toBe(500)
        expect(res.body).toEqual({})
      })
    })
  })

  it('returns 500 {} when resolving the session uid fails', async () => {
    mockedGetUserUIDBySession.mockRejectedValueOnce(new Error('no uid'))
    const res = await supertest(buildAuthedApp()).post('/writeApi/topics').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({})
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('POST /users posts the body with the admin uid and relays errors', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { uid: 99 } })
    let res = await supertest(buildAuthedApp()).post('/writeApi/users').send({ username: 'bob', _uid: 5 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ uid: 99 })
    expect(mockedAxios.post.mock.calls[0][0]).toBe(`${V2}/users`)
    expect(mockedAxios.post.mock.calls[0][1]).toStrictEqual({ username: 'bob', _uid: 1 })
    expect(mockedAxios.post.mock.calls[0][2]).toStrictEqual(expectedConfig)
    mockedAxios.post.mockRejectedValueOnce({ response: { data: { error: 'dup' }, status: 409 } })
    res = await supertest(buildAuthedApp()).post('/writeApi/users').send({})
    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: 'dup' })
    mockedAxios.post.mockRejectedValueOnce(new Error('down'))
    res = await supertest(buildAuthedApp()).post('/writeApi/users').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({})
  })
})
