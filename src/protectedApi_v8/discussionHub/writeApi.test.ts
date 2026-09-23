jest.mock('axios')
jest.mock('../../utils/discussionHub-helper', () => ({
  getUserUIDBySession: jest.fn(),
  getWriteApiAdminUID: jest.fn(),
}))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { getUserUIDBySession, getWriteApiAdminUID } from '../../utils/discussionHub-helper'
import { createDiscussionHubUser, writeApi } from './writeApi'

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
