jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { emailToUserIdApi, getUserId } from './emailToUserId'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(emailToUserIdApi)
  return app
}

describe('getUserId', () => {
  it('returns the resolved user data on success', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { result: { email: 'a@b.com', userId: 'user-1' } } } })
    const result = await getUserId('a@b.com')
    expect(result).toEqual({ email: 'a@b.com', userId: 'user-1' })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/v1/user/finduuid?userEmail=a@b.com`,
      expect.any(Object)
    )
  })

  it('returns a null userId when the upstream result is an error', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { error: 'not found' } } })
    const result = await getUserId('missing@b.com')
    expect(result).toEqual({ email: 'missing@b.com', userId: null })
  })
})

describe('emailToUserIdApi', () => {
  it('resolves the userId for the given email param', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { result: { email: 'a@b.com', userId: 'user-1' } } } })
    const res = await supertest(buildApp()).get('/a@b.com')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ email: 'a@b.com', userId: 'user-1' })
  })

  it('falls back to a generic 500 error when the lookup fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/a@b.com')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
