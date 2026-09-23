jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { contentValidationApi } from './contentValidation'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(contentValidationApi)
  return app
}

describe('contentValidationApi GET /checkProfanity/:contentId/:userId', () => {
  it('returns 400 when required headers are missing', async () => {
    const res = await supertest(buildApp()).get('/checkProfanity/c1/u1')
    expect(res.status).toBe(400)
  })

  it('checks profanity for the given content/user', async () => {
    mockedAxios.get.mockResolvedValue({ data: { clean: true }, status: 200 })
    const res = await supertest(buildApp())
      .get('/checkProfanity/c1/u1')
      .set('rootorg', 'igot')
      .set('org', 'dopt')
      .set('wid', 'u1')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.CONTENT_VALIDATION_API_BASE}/contentValidation/v1/checkProfanity/c1/u1`,
      expect.any(Object)
    )
  })
})

describe('contentValidationApi POST /checkTextProfanity', () => {
  it('checks text profanity', async () => {
    mockedAxios.post.mockResolvedValue({ data: { flagged: false }, status: 200 })
    const res = await supertest(buildApp()).post('/checkTextProfanity').send({ text: 'hello' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.PROFANITY_SERVICE_API_BASE}/checkProfanity`,
      { text: 'hello' },
      expect.any(Object)
    )
  })

  it('falls back to a generic 500 error when the check fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/checkTextProfanity').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('contentValidationApi POST /validatePdfContent', () => {
  it('validates PDF content', async () => {
    mockedAxios.post.mockResolvedValue({ data: { jobId: 'j1' }, status: 200 })
    const res = await supertest(buildApp()).post('/validatePdfContent').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.CONTENT_VALIDATION_API_BASE}/contentValidation/v1/checkPdfProfanity`,
      {},
      expect.any(Object)
    )
  })
})

describe('contentValidationApi POST /startPdfProfanity', () => {
  it('starts a PDF profanity scan with the authenticated user token', async () => {
    mockedAxios.post.mockResolvedValue({ data: { started: true }, status: 200 })
    const res = await supertest(buildApp()).post('/startPdfProfanity').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/contentValidation/v1/startPdfProfanity`,
      {},
      expect.objectContaining({ headers: expect.objectContaining({ 'x-authenticated-user-token': 'tok' }) })
    )
  })
})

describe('contentValidationApi POST /getPdfProfanity', () => {
  it('fetches PDF profanity results', async () => {
    mockedAxios.post.mockResolvedValue({ data: { results: [] }, status: 200 })
    const res = await supertest(buildApp()).post('/getPdfProfanity').send({})
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(`${CONSTANTS.KONG_API_BASE}/contentValidation/v1/getPdfProfanity`, {}, expect.any(Object))
  })
})

describe('contentValidationApi GET /getPdfProfanityForContent/:contentId', () => {
  it('fetches PDF profanity results for a content id', async () => {
    mockedAxios.get.mockResolvedValue({ data: { results: [] }, status: 200 })
    const res = await supertest(buildApp()).get('/getPdfProfanityForContent/c1')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/contentValidation/v1/getPdfProfanityForContent/c1`,
      expect.any(Object)
    )
  })
})
