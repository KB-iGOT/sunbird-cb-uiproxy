jest.mock('axios')

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { ERROR } from '../../utils/message'
import { evaluateApi } from './evaluate'

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedAxiosFn = axios as unknown as jest.Mock

function buildApp(session?: object) {
  const app = express()
  app.use(express.json())
  if (session) {
    app.use((req, _res, next) => {
      (req as never as { session: object }).session = session
      next()
    })
  }
  app.use('/evaluate', evaluateApi)
  return app
}

describe('evaluateApi', () => {
  describe('POST /assessment/submit/v2', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).post('/evaluate/assessment/submit/v2').send({})
      expect(res.status).toBe(400)
      expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
    })

    it('submits the assessment', async () => {
      mockedAxiosFn.mockResolvedValue({ data: { submitted: true }, status: 200 })
      const res = await supertest(buildApp())
        .post('/evaluate/assessment/submit/v2')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
        .send({ answers: [] })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ submitted: true })
    })

    it('returns the upstream error on failure', async () => {
      mockedAxiosFn.mockRejectedValue({ response: { data: { error: 'bad' }, status: 422 } })
      const res = await supertest(buildApp())
        .post('/evaluate/assessment/submit/v2')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
        .send({})
      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error: 'bad' })
    })
  })

  describe('POST /assessment/submit/v3', () => {
    it('submits without requiring org headers', async () => {
      mockedAxiosFn.mockResolvedValue({ data: { submitted: true }, status: 200 })
      const res = await supertest(buildApp())
        .post('/evaluate/assessment/submit/v3')
        .set('wid', 'user-1')
        .send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ submitted: true })
    })
  })

  describe('POST /assessment/submit/iap', () => {
    it('submits without requiring org headers', async () => {
      mockedAxiosFn.mockResolvedValue({ data: { submitted: true }, status: 200 })
      const res = await supertest(buildApp())
        .post('/evaluate/assessment/submit/iap')
        .send({ root_org: 'igot' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ submitted: true })
    })

    it('returns the upstream error on failure', async () => {
      mockedAxiosFn.mockRejectedValue({ response: { data: { error: 'bad' }, status: 400 } })
      const res = await supertest(buildApp())
        .post('/evaluate/assessment/submit/iap')
        .send({ root_org: 'igot' })
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'bad' })
    })
  })

  describe('GET /post-assessment/:contentId', () => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).get('/evaluate/post-assessment/c1')
      expect(res.status).toBe(400)
    })

    it('fetches the post assessment result', async () => {
      mockedAxios.post.mockResolvedValue({ data: { passed: true } })
      const res = await supertest(buildApp())
        .get('/evaluate/post-assessment/c1')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ passed: true })
    })

    it('returns the upstream error on failure', async () => {
      mockedAxios.post.mockRejectedValue({ response: { data: { error: 'bad' }, status: 404 } })
      const res = await supertest(buildApp())
        .get('/evaluate/post-assessment/c1')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(404)
    })
  })

  describe('POST /assessment/submit/v4', () => {
    it('reads rootOrgId from the session when available', async () => {
      mockedAxiosFn.mockResolvedValue({ data: { submitted: true }, status: 200 })
      const res = await supertest(buildApp({ rootOrgId: 'igot' }))
        .post('/evaluate/assessment/submit/v4')
        .set('wid', 'user-1')
        .send({})
      expect(res.status).toBe(200)
      const [config] = mockedAxiosFn.mock.calls[mockedAxiosFn.mock.calls.length - 1]
      expect(config.headers['x-authenticated-user-orgid']).toBe('igot')
    })

    it('defaults rootOrgId to an empty string without a session', async () => {
      mockedAxiosFn.mockResolvedValue({ data: { submitted: true }, status: 200 })
      const res = await supertest(buildApp())
        .post('/evaluate/assessment/submit/v4')
        .set('wid', 'user-1')
        .send({})
      expect(res.status).toBe(200)
      const [config] = mockedAxiosFn.mock.calls[mockedAxiosFn.mock.calls.length - 1]
      expect(config.headers['x-authenticated-user-orgid']).toBe('')
    })
  })

  describe.each(['v5', 'v6', 'v7'])('POST /assessment/submit/%s', (version) => {
    it('submits the assessment successfully', async () => {
      mockedAxiosFn.mockResolvedValue({ data: { submitted: true }, status: 200 })
      const res = await supertest(buildApp())
        .post(`/evaluate/assessment/submit/${version}`)
        .set('wid', 'user-1')
        .send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ submitted: true })
    })

    it('returns the upstream error on failure', async () => {
      mockedAxiosFn.mockRejectedValue({ response: { data: { error: 'bad' }, status: 500 } })
      const res = await supertest(buildApp())
        .post(`/evaluate/assessment/submit/${version}`)
        .set('wid', 'user-1')
        .send({})
      expect(res.status).toBe(500)
    })
  })
})
