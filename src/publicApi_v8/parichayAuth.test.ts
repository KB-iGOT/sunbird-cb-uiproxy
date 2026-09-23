jest.mock('axios', () => jest.fn())
jest.mock('./ssoUserHelper', () => ({
  createUserWithMailId: jest.fn(),
  fetchUserByEmailId: jest.fn(),
  updateKeycloakSession: jest.fn(),
}))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { parichayAuth } from './parichayAuth'
import { createUserWithMailId, fetchUserByEmailId, updateKeycloakSession } from './ssoUserHelper'

const mockedAxios = axios as unknown as jest.Mock
const mockedFetchUserByEmailId = fetchUserByEmailId as jest.Mock
const mockedCreateUserWithMailId = createUserWithMailId as jest.Mock
const mockedUpdateKeycloakSession = updateKeycloakSession as jest.Mock

function buildApp() {
  const app = express()
  app.use((req: Request & { session?: object }, _res: Response, next: NextFunction) => {
    req.session = { cookie: {} } as any
    next()
  })
  app.use(parichayAuth)
  return app
}

describe('parichayAuth GET /auth', () => {
  it('redirects to the Parichay authorization url', async () => {
    const res = await supertest(buildApp()).get('/auth')
    expect(res.status).toBe(302)
    expect(res.header.location).toContain(CONSTANTS.PARICHAY_AUTH_URL)
    expect(res.header.location).toContain(`client_id=${CONSTANTS.PARICHAY_CLIENT_ID}`)
  })
})

describe('parichayAuth GET /callback', () => {
  it('redirects to logout with an error when the authorization code is missing', async () => {
    const res = await supertest(buildApp()).get('/callback')
    expect(res.status).toBe(302)
    expect(res.header.location).toContain('/public/logout?error=')
  })

  it('redirects new users to /public/welcome after registering them', async () => {
    mockedAxios.mockResolvedValueOnce({ data: { access_token: 'kc-token' } })
    mockedAxios.mockResolvedValueOnce({ data: { FirstName: 'Jane', LastName: 'Doe', MobileNo: '9999999999', loginId: 'jane@example.com' } })
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: '', rootOrgId: '', userExist: false })
    mockedCreateUserWithMailId.mockResolvedValue({ errMessage: '', userCreated: true, userId: 'user-1' })
    mockedUpdateKeycloakSession.mockResolvedValue({ access_token: 'a', errMessage: '', keycloakSessionCreated: true, refresh_token: 'r' })

    const res = await supertest(buildApp()).get('/callback?code=auth-code')

    expect(res.status).toBe(302)
    expect(res.header.location).toMatch(/\/public\/welcome$/)
    expect(mockedCreateUserWithMailId).toHaveBeenCalledWith('jane@example.com', 'Jane', 'Doe', '9999999999', 'parichay')
  })

  it('redirects existing users to /page/home', async () => {
    mockedAxios.mockResolvedValueOnce({ data: { access_token: 'kc-token' } })
    mockedAxios.mockResolvedValueOnce({ data: { loginId: 'jane@example.com' } })
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: '', rootOrgId: 'some-org', userExist: true })
    mockedUpdateKeycloakSession.mockResolvedValue({ access_token: 'a', errMessage: '', keycloakSessionCreated: true, refresh_token: 'r' })

    const res = await supertest(buildApp()).get('/callback?code=auth-code')

    expect(res.header.location).toMatch(/\/page\/home$/)
    expect(mockedCreateUserWithMailId).not.toHaveBeenCalled()
  })

  it('redirects to logout with an error when Parichay does not return a loginId', async () => {
    mockedAxios.mockResolvedValueOnce({ data: { access_token: 'kc-token' } })
    mockedAxios.mockResolvedValueOnce({ data: {} })

    const res = await supertest(buildApp()).get('/callback?code=auth-code')

    expect(res.header.location).toContain('/public/logout?error=')
    expect(mockedFetchUserByEmailId).not.toHaveBeenCalled()
  })

  it('redirects to logout with an error when the token exchange fails', async () => {
    mockedAxios.mockRejectedValue(new Error('token exchange failed'))
    const res = await supertest(buildApp()).get('/callback?code=auth-code')
    expect(res.header.location).toContain('/public/logout?error=')
  })
})
