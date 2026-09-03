jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { accountSettingsApi } from './account-settings'

const mockedAxios = axios as unknown as { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(accountSettingsApi)
  return app
}

describe('accountSettingsApi POST /resetPassword', () => {
  it('triggers a password reset token generation', async () => {
    mockedAxios.post.mockResolvedValue({ data: { sent: true }, status: 200 })
    const res = await supertest(buildApp()).post('/resetPassword')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ sent: true })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.RESET_PASSWORD}/pid/reset-password/generate-token`,
      {}
    )
  })

  it('falls back to the raw error when the request fails without a response', async () => {
    mockedAxios.post.mockRejectedValue({ message: 'down' })
    const res = await supertest(buildApp()).post('/resetPassword')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ message: 'down' })
  })
})

describe('accountSettingsApi POST /', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).post('/').set('org', 'dopt').send({})
    expect(res.status).toBe(400)
    expect(mockedAxios.post).not.toHaveBeenCalled()
  })

  it('upserts the profile when rootOrg is present', async () => {
    mockedAxios.post.mockResolvedValue({ data: { updated: true }, status: 200 })
    const res = await supertest(buildApp()).post('/').set('rootOrg', 'igot').set('org', 'dopt').send({ name: 'x' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ updated: true })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.NODE_API_BASE}/userprofiles/pathfinders/upsert`,
      { name: 'x' },
      expect.objectContaining({ headers: expect.objectContaining({ org: 'dopt', rootOrg: 'igot' }) })
    )
  })
})
