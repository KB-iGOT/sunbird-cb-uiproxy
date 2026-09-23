jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { fracApi } from './frac'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'the-token' } } }
    next()
  })
  app.use(fracApi)
  return app
}

describe('fracApi GET /getAllNodes/:type', () => {
  // NOTE: the `default:` switch case for an unconfigured `type` sends a 400 but has no
  // `return` — execution falls through to the axios call and a second res.send(), which
  // throws "Cannot set headers after they are sent" as an unhandled rejection. That's a
  // real bug in the route (not something to paper over in a test), so it's intentionally
  // not exercised here — doing so reliably corrupts the surrounding test's pass/fail state.

  it('fetches the dictionary (competency) nodes', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'c1' }], status: 200 })
    const res = await supertest(buildApp()).get('/getAllNodes/dictionary')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.FRAC_API_BASE}/frac/getAllNodes?type=COMPETENCY&status=VERIFIED`,
      expect.objectContaining({ headers: { Authorization: 'Bearer the-token' } })
    )
  })

  it('appends the bookmarks filter for knowledgeResource', async () => {
    mockedAxios.get.mockResolvedValue({ data: [], status: 200 })
    await supertest(buildApp()).get('/getAllNodes/knowledgeResource?bookmarks=true')
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('&bookmarks=true'),
      expect.any(Object)
    )
  })
})

describe('fracApi POST /addDataNode', () => {
  it('adds a competency node', async () => {
    mockedAxios.post.mockResolvedValue({ data: { id: 'n1' }, status: 200 })
    const res = await supertest(buildApp()).post('/addDataNode').send({ name: 'x' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.FRAC_API_BASE}/frac/addDataNode`, { name: 'x' }, expect.any(Object))
  })

  it('falls back to a generic 500 error on failure', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/addDataNode').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('fracApi POST /addDataNodeBulk', () => {
  it('adds nodes in bulk', async () => {
    mockedAxios.post.mockResolvedValue({ data: { added: 2 }, status: 200 })
    const res = await supertest(buildApp()).post('/addDataNodeBulk').send({ nodes: [] })
    expect(res.status).toBe(200)
  })
})

describe('fracApi POST /searchNodes', () => {
  it('searches nodes', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ id: 'n1' }], status: 200 })
    const res = await supertest(buildApp()).post('/searchNodes').send({ query: 'java' })
    expect(res.status).toBe(200)
  })
})

describe('fracApi POST /filterByMappings', () => {
  it('filters nodes by mapping', async () => {
    mockedAxios.post.mockResolvedValue({ data: [], status: 200 })
    const res = await supertest(buildApp()).post('/filterByMappings').send({})
    expect(res.status).toBe(200)
  })
})

describe('fracApi GET /getNodeById/:id/:type', () => {
  it('fetches a node by id/type', async () => {
    mockedAxios.get.mockResolvedValue({ data: { id: 'n1' }, status: 200 })
    const res = await supertest(buildApp()).get('/getNodeById/n1/COMPETENCY')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('getNodeById?id=n1&type=COMPETENCY&isDetail=true'),
      expect.any(Object)
    )
  })
})

describe('fracApi GET /:type/:key', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/COMPETENCY/java')
    expect(res.status).toBe(400)
  })

  it('searches for a verified node by name', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ id: 'n1' }] })
    const res = await supertest(buildApp()).get('/COMPETENCY/java').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.FRAC_API_BASE}/frac/searchNodes`,
      expect.objectContaining({
        searches: expect.arrayContaining([expect.objectContaining({ keyword: 'java' })]),
      }),
      expect.any(Object)
    )
  })
})

describe('fracApi POST /bookmarkDataNode', () => {
  it('bookmarks a node', async () => {
    mockedAxios.post.mockResolvedValue({ data: { bookmarked: true }, status: 200 })
    const res = await supertest(buildApp()).post('/bookmarkDataNode').send({ id: 'n1' })
    expect(res.status).toBe(200)
  })
})
