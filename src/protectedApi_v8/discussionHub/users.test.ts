jest.mock('axios')
jest.mock('../../utils/discussionHub-helper', () => ({
  getUserSlug: jest.fn(),
  getUserUIDBySession: jest.fn(),
}))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { getUserSlug, getUserUIDBySession } from '../../utils/discussionHub-helper'
import { getUserByEmail, getUserByUsername, usersApi } from './users'

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
