jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { knowledgeHubApi } from './khub'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(knowledgeHubApi)
  return app
}

describe('knowledgeHubApi GET /fetchRelatedResources/:contentId/:contentType', () => {
  it('returns 400 when rootOrg/org headers are missing', async () => {
    const res = await supertest(buildApp()).get('/fetchRelatedResources/c1/article')
    expect(res.status).toBe(400)
  })

  it('fetches related resources', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { response: { items: [], status: 200 } } } })
    const res = await supertest(buildApp())
      .get('/fetchRelatedResources/c1/article')
      .set('rootOrg', 'igot')
      .set('org', 'dopt')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KHUB_SEARCH_BASE}/api/v1/moreLikeThis/c1?contentType=article`,
      expect.objectContaining({ headers: { org: 'dopt', rootOrg: 'igot' } })
    )
  })
})

describe('knowledgeHubApi GET /home/', () => {
  it('fetches the search home page', async () => {
    mockedAxios.get.mockResolvedValue({ data: { results: [] } })
    const res = await supertest(buildApp()).get('/home/?size=10')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ results: [] })
    // getStringifiedQueryParams drops falsy values, so from=0 is omitted from the query string
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KHUB_SEARCH_BASE}/api/v1/search?size=10`,
      expect.any(Object)
    )
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/home/')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('knowledgeHubApi GET /search/:query/:from/:size/:category', () => {
  it('searches with the given query parameters', async () => {
    mockedAxios.get.mockResolvedValue({ data: { items: [] } })
    const res = await supertest(buildApp()).get('/search/java/0/10/tech')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('searchQuery=java'),
      expect.any(Object)
    )
  })
})

describe('knowledgeHubApi GET /item/:id', () => {
  it('fetches a single item', async () => {
    mockedAxios.get.mockResolvedValue({ data: { id: 'i1' } })
    const res = await supertest(buildApp()).get('/item/i1')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'i1' })
  })
})

describe('knowledgeHubApi GET /moreLike/:category/:itemId/:source', () => {
  it('fetches more-like-this items', async () => {
    mockedAxios.get.mockResolvedValue({ data: [] })
    const res = await supertest(buildApp()).get('/moreLike/tech/i1/web')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining(`${CONSTANTS.KHUB_SEARCH_BASE}/api/v1/moreLikeThis?`),
      expect.any(Object)
    )
  })
})

describe('knowledgeHubApi POST /topic', () => {
  it('creates/updates a topic', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 't1' } })
    const res = await supertest(buildApp()).post('/topic').send({ name: 'Java' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.KHUB_SEARCH_BASE}/api/v1/topic`, { name: 'Java' }, expect.any(Object))
  })

  it('falls back to a generic 500 error when the request fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/topic').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
