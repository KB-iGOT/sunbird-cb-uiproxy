import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { lookerDashboard } from './lookerIntegration'

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/looker', lookerDashboard)
  return app
}

const validRequest = {
  request: {
    embedUrl: '/embed/dashboards/1',
    userAttributes: { firstName: 'Jane', userId: 'user-1' },
  },
}

describe('lookerDashboard POST /*', () => {
  it('returns 400 when the request body is missing', async () => {
    const res = await supertest(buildApp()).post('/looker/generate').send({})
    expect(res.status).toBe(400)
  })

  it('returns 400 when userAttributes is empty', async () => {
    const res = await supertest(buildApp()).post('/looker/generate').send({ request: { userAttributes: {} } })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('userAttributes')
  })

  it('returns 400 when userId is missing from userAttributes', async () => {
    const res = await supertest(buildApp())
      .post('/looker/generate')
      .send({ request: { userAttributes: { firstName: 'Jane' } } })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('userId')
  })

  it('returns 400 when embedUrl is missing', async () => {
    const res = await supertest(buildApp())
      .post('/looker/generate')
      .send({ request: { userAttributes: { userId: 'user-1' } } })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('embedUrl')
  })

  it('returns 400 when userPermissions is not an array', async () => {
    const res = await supertest(buildApp())
      .post('/looker/generate')
      .send({ request: { ...validRequest.request, userPermissions: 'not-an-array' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('userPermissions')
  })

  it('returns 400 when userModels is not an array', async () => {
    const res = await supertest(buildApp())
      .post('/looker/generate')
      .send({ request: { ...validRequest.request, userModels: 'not-an-array' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('userModels')
  })

  it('returns 400 when userGroupIds is not an array', async () => {
    const res = await supertest(buildApp())
      .post('/looker/generate')
      .send({ request: { ...validRequest.request, userGroupIds: 'not-an-array' } })
    expect(res.status).toBe(400)
    expect(res.body.error).toContain('userGroupIds')
  })

  it('generates a signed embed url for a valid request', async () => {
    const res = await supertest(buildApp()).post('/looker/generate').send(validRequest)

    expect(res.status).toBe(200)
    expect(typeof res.body.signedUrl).toBe('string')
    expect(res.body.signedUrl).toContain(`https://${CONSTANTS.LOOKER_HOST}`)
    expect(res.body.signedUrl).toContain('/login/embed/')
    expect(res.body.signedUrl).toContain('signature=')
  })

  it('sets no-cache headers on the response', async () => {
    const res = await supertest(buildApp()).post('/looker/generate').send(validRequest)
    expect(res.header['cache-control']).toContain('no-cache')
    expect(res.header.pragma).toBe('no-cache')
  })
})
