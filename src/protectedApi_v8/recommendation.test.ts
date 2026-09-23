jest.mock('axios')

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { ERROR } from '../utils/message'
import { recommendationApi } from './recommendation'

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedAxiosFn = axios as unknown as jest.Mock

function buildApp() {
  const app = express()
  app.use('/recommendation', recommendationApi)
  return app
}

describe('recommendationApi', () => {
  describe('GET /', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).get('/recommendation/')
      expect(res.status).toBe(400)
      expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
    })

    it('returns a single processed recommendation', async () => {
      mockedAxiosFn.mockResolvedValue({
        data: { result: { response: { result: [{ identifier: 'c1' }] } } },
      })
      const res = await supertest(buildApp())
        .get('/recommendation/')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body.contents).toHaveLength(1)
      expect(res.body.contents[0]).toMatchObject({ identifier: 'c1', children: [] })
      expect(res.body.hasMore).toBe(false)
    })

    it('returns 500 with a fallback error on failure', async () => {
      mockedAxiosFn.mockRejectedValue(new Error('down'))
      const res = await supertest(buildApp())
        .get('/recommendation/')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: ERROR.GENERAL_ERR_MSG })
    })
  })

  describe('GET /interestBased', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).get('/recommendation/interestBased')
      expect(res.status).toBe(400)
    })

    it('returns processed interest-based recommendations', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { result: { response: { result: [{ identifier: 'c1' }] } } },
      })
      const res = await supertest(buildApp())
        .get('/recommendation/interestBased')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body.contents).toHaveLength(1)
      expect(res.body.contents[0]).toMatchObject({ identifier: 'c1', children: [] })
    })
  })

  describe('GET /keyword', () => {
    it('searches by user interests when interests exist', async () => {
      mockedAxios.get.mockResolvedValue({ data: { user_interest: ['ai', 'ml'] } })
      mockedAxios.post.mockResolvedValue({ data: { result: [{ identifier: 'c1' }] } })
      const res = await supertest(buildApp())
        .get('/recommendation/keyword')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body.contents).toHaveLength(1)
      expect(res.body.contents[0]).toMatchObject({ identifier: 'c1', children: [] })
    })

    it('returns empty contents when there is no user_interest array in the response', async () => {
      mockedAxios.get.mockResolvedValue({ data: {} })
      const res = await supertest(buildApp())
        .get('/recommendation/keyword')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body.contents).toEqual([])
    })

    it('returns 500 on failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('down'))
      const res = await supertest(buildApp())
        .get('/recommendation/keyword')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /usageBased', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).get('/recommendation/usageBased')
      expect(res.status).toBe(400)
    })

    it('returns processed usage-based recommendations', async () => {
      mockedAxiosFn.mockResolvedValue({
        data: { result: { response: [{ identifier: 'c1' }] } },
      })
      const res = await supertest(buildApp())
        .get('/recommendation/usageBased')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body.contents).toHaveLength(1)
      expect(res.body.contents[0]).toMatchObject({ identifier: 'c1', children: [] })
    })
  })

  describe('GET /:recommendationType', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).get('/recommendation/trending')
      expect(res.status).toBe(400)
    })

    it('returns processed recommendations for a type', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { result: { response: [{ identifier: 'c1' }] } },
      })
      const res = await supertest(buildApp())
        .get('/recommendation/trending')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body.contents).toHaveLength(1)
      expect(res.body.contents[0]).toMatchObject({ identifier: 'c1', children: [] })
    })

    it('excludes content types for iGOT/iGOT Ltd requests to the latest endpoint', async () => {
      mockedAxios.get.mockResolvedValue({ data: { result: { response: [] } } })
      const res = await supertest(buildApp())
        .get('/recommendation/latest')
        .set('org', 'iGOT Ltd')
        .set('rootOrg', 'iGOT')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      const [, config] = mockedAxios.get.mock.calls[mockedAxios.get.mock.calls.length - 1]
      expect(config.params.excludeContentType).toBeDefined()
      expect(config.params.learningMode).toBe('Self-Paced')
      // Bug: params.url is never initialized, so this string-concat assignment produces
      // the literal string "undefinedisExternal=false" instead of a real query param.
      expect(config.params.url).toBe('undefinedisExternal=false')
    })

    it('returns 500 on failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('down'))
      const res = await supertest(buildApp())
        .get('/recommendation/trending')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(500)
    })
  })
})
