jest.mock('axios')

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { ERROR } from '../../utils/message'
import { feedbackV2Api } from './feedbackV2'

const mockedAxios = axios as jest.Mocked<typeof axios>

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/feedback', feedbackV2Api)
  return app
}

describe('feedbackV2Api', () => {
  describe('POST /platform', () => {
    it('returns 400 without a rootorg header', async () => {
      const res = await supertest(buildApp()).post('/feedback/platform').send({})
      expect(res.status).toBe(400)
      expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
    })

    it('submits platform feedback', async () => {
      mockedAxios.post.mockResolvedValue({ data: { id: 'f1' } })
      const res = await supertest(buildApp())
        .post('/feedback/platform')
        .set('rootorg', 'igot')
        .set('wid', 'user-1')
        .send({ text: 'great', type: 'platform', sentiment: 'positive' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 'f1' })
    })
  })

  describe('POST /content/:contentId', () => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).post('/feedback/content/c1').send({})
      expect(res.status).toBe(400)
    })

    it('submits content feedback', async () => {
      mockedAxios.post.mockResolvedValue({ data: { id: 'f2' } })
      const res = await supertest(buildApp())
        .post('/feedback/content/c1')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
        .send({ text: 'nice', type: 'content' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 'f2' })
    })

    it('returns the upstream error on failure', async () => {
      mockedAxios.post.mockRejectedValue({ response: { data: { error: 'bad' }, status: 422 } })
      const res = await supertest(buildApp())
        .post('/feedback/content/c1')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
        .send({})
      expect(res.status).toBe(422)
    })
  })

  describe.each(['content-request', 'service-request'])('POST /%s', (route) => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).post(`/feedback/${route}`).send({})
      expect(res.status).toBe(400)
    })

    it('submits sentiment-neutral feedback', async () => {
      mockedAxios.post.mockResolvedValue({ data: { id: 'f3' } })
      const res = await supertest(buildApp())
        .post(`/feedback/${route}`)
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
        .send({ text: 'request', type: route })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 'f3' })
    })
  })

  describe('GET /feedback-summary', () => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).get('/feedback/feedback-summary')
      expect(res.status).toBe(400)
    })

    it('returns the feedback summary', async () => {
      mockedAxios.get.mockResolvedValue({ data: { total: 5 } })
      const res = await supertest(buildApp())
        .get('/feedback/feedback-summary')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ total: 5 })
    })
  })

  describe('POST /search', () => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).post('/feedback/search').send({})
      expect(res.status).toBe(400)
    })

    it('returns search results', async () => {
      mockedAxios.post.mockResolvedValue({ data: { results: [] } })
      const res = await supertest(buildApp())
        .post('/feedback/search')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
        .send({ query: 'hi' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ results: [] })
    })
  })

  describe('GET /:feedbackId', () => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).get('/feedback/f1')
      expect(res.status).toBe(400)
    })

    it('returns the feedback thread', async () => {
      mockedAxios.get.mockResolvedValue({ data: { id: 'f1' } })
      const res = await supertest(buildApp())
        .get('/feedback/f1')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: 'f1' })
    })

    it('shadows the dedicated /categories route since it is registered later with an identical GET pattern', async () => {
      mockedAxios.get.mockResolvedValue({ data: { id: 'categories' } })
      const res = await supertest(buildApp())
        .get('/feedback/categories')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(mockedAxios.get.mock.calls[0][0]).toContain('/feedback/categories?user_Id=')
    })
  })

  describe('PATCH /:feedbackId', () => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).patch('/feedback/f1').send({})
      expect(res.status).toBe(400)
    })

    it('updates the feedback status', async () => {
      mockedAxios.patch.mockResolvedValue({ data: { updated: true } })
      const res = await supertest(buildApp())
        .patch('/feedback/f1')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
        .send({ status: 'resolved' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ updated: true })
    })
  })
})
