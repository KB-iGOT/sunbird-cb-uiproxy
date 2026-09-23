jest.mock('axios', () => jest.fn())
jest.mock('jwt-decode', () => jest.fn())
jest.mock('../utils/redis', () => ({
  redis: { del: jest.fn(), get: jest.fn(), set: jest.fn() },
}))
jest.mock('./ssoUserHelper', () => ({
  createUserWithMailId: jest.fn(),
  fetchUserByEmailId: jest.fn(),
  updateKeycloakSession: jest.fn(),
}))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import jwt_decode from 'jwt-decode'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { redis } from '../utils/redis'
import { ntpcAuth } from './ntpcAuth'
import { createUserWithMailId, fetchUserByEmailId, updateKeycloakSession } from './ssoUserHelper'

const mockedAxios = axios as unknown as jest.Mock
const mockedJwtDecode = jwt_decode as jest.Mock
const mockedRedis = redis as unknown as { del: jest.Mock; get: jest.Mock; set: jest.Mock }
const mockedFetchUserByEmailId = fetchUserByEmailId as jest.Mock
const mockedCreateUserWithMailId = createUserWithMailId as jest.Mock
const mockedUpdateKeycloakSession = updateKeycloakSession as jest.Mock

function buildApp() {
  const app = express()
  app.use((req: Request & { session?: object }, _res: Response, next: NextFunction) => {
    req.session = { cookie: {} } as any
    next()
  })
  app.use(ntpcAuth)
  return app
}

describe('ntpcAuth GET /auth', () => {
  it('stores a state token in redis and redirects to the NTPC authorization url', async () => {
    mockedRedis.set.mockResolvedValue('OK')
    const res = await supertest(buildApp()).get('/auth')
    expect(res.status).toBe(302)
    expect(res.header.location).toContain(CONSTANTS.NTPC_AUTH_URL)
    expect(mockedRedis.set).toHaveBeenCalledWith(expect.stringContaining('ntpc_auth_state:'), 'VALID', 'EX', 300)
  })
})

describe('ntpcAuth GET /login/callback', () => {
  it('redirects to logout with an error when the authorization code is missing', async () => {
    const res = await supertest(buildApp()).get('/login/callback')
    expect(res.header.location).toContain('/public/logout?error=')
  })

  it('redirects to logout when the state token is invalid or expired', async () => {
    mockedRedis.get.mockResolvedValue(null)
    const res = await supertest(buildApp()).get('/login/callback?code=abc&state=bad-state')
    expect(res.header.location).toContain('/public/logout?error=')
    expect(mockedAxios).not.toHaveBeenCalled()
  })

  it('redirects new users to /public/welcome after registering them', async () => {
    mockedRedis.get.mockResolvedValue('VALID')
    mockedRedis.del.mockResolvedValue(1)
    mockedAxios.mockResolvedValueOnce({ data: { access_token: 'kc-token' } })
    mockedJwtDecode.mockReturnValue({ oid: 'oid-1' })
    mockedAxios.mockResolvedValueOnce({ data: { givenName: 'Jane', mail: 'jane@ntpc.com', mobilePhone: '999', surname: 'Doe' } })
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: '', rootOrgId: '', userExist: false })
    mockedCreateUserWithMailId.mockResolvedValue({ errMessage: '', userCreated: true, userId: 'user-1' })
    mockedUpdateKeycloakSession.mockResolvedValue({ access_token: 'a', errMessage: '', keycloakSessionCreated: true, refresh_token: 'r' })

    const res = await supertest(buildApp()).get('/login/callback?code=abc&state=good-state')

    expect(res.header.location).toMatch(/\/public\/welcome$/)
    expect(mockedCreateUserWithMailId).toHaveBeenCalledWith('jane@ntpc.com', 'Jane', 'Doe', '999', 'ntpc')
  })

  it('redirects existing users to /page/home on success', async () => {
    mockedRedis.get.mockResolvedValue('VALID')
    mockedRedis.del.mockResolvedValue(1)
    mockedAxios.mockResolvedValueOnce({ data: { access_token: 'kc-token' } })
    mockedJwtDecode.mockReturnValue({ oid: 'oid-1' })
    mockedAxios.mockResolvedValueOnce({ data: { mail: 'jane@ntpc.com', mobilePhone: '999', surname: 'Doe' } })
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: '', rootOrgId: 'org-1', userExist: true })
    mockedUpdateKeycloakSession.mockResolvedValue({ access_token: 'a', errMessage: '', keycloakSessionCreated: true, refresh_token: 'r' })

    const res = await supertest(buildApp()).get('/login/callback?code=abc&state=good-state')

    expect(res.header.location).toMatch(/\/page\/home$/)
    expect(mockedRedis.del).toHaveBeenCalledWith('ntpc_auth_state:good-state')
  })

  it('redirects to logout with an error when NTPC does not return a mail', async () => {
    mockedRedis.get.mockResolvedValue('VALID')
    mockedAxios.mockResolvedValueOnce({ data: { access_token: 'kc-token' } })
    mockedJwtDecode.mockReturnValue({ oid: 'oid-1' })
    mockedAxios.mockResolvedValueOnce({ data: {} })

    const res = await supertest(buildApp()).get('/login/callback?code=abc&state=good-state')

    expect(res.header.location).toContain('/public/logout?error=')
    expect(mockedFetchUserByEmailId).not.toHaveBeenCalled()
  })

  it('redirects to logout with an error when the token exchange fails', async () => {
    mockedRedis.get.mockResolvedValue('VALID')
    mockedAxios.mockRejectedValue(new Error('token exchange failed'))
    const res = await supertest(buildApp()).get('/login/callback?code=abc&state=good-state')
    expect(res.header.location).toContain('/public/logout?error=')
  })
})
