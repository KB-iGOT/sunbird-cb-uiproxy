jest.mock('./googleOAuthHelper', () => ({
  getGoogleProfile: jest.fn(),
}))

jest.mock('./ssoUserHelper', () => ({
  createUserWithMailId: jest.fn(),
  fetchUserByEmailId: jest.fn(),
  updateKeycloakSession: jest.fn(),
}))

import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { googleAuth } from './googleauth'
import { getGoogleProfile } from './googleOAuthHelper'
import { createUserWithMailId, fetchUserByEmailId, updateKeycloakSession } from './ssoUserHelper'

const mockedGetGoogleProfile = getGoogleProfile as jest.Mock
const mockedFetchUserByEmailId = fetchUserByEmailId as jest.Mock
const mockedCreateUserWithMailId = createUserWithMailId as jest.Mock
const mockedUpdateKeycloakSession = updateKeycloakSession as jest.Mock

function buildApp() {
  const app = express()
  app.use('/public/v8/google', googleAuth)
  return app
}

describe('googleAuth redirect routes', () => {
  it('builds the /auth redirect using GOOGLE_AUTH_CALLBACK_URL', async () => {
    const res = await supertest(buildApp()).get('/public/v8/google/auth')
    expect(res.status).toBe(302)
    expect(res.header.location).toContain('accounts.google.com')
    expect(res.header.location).toContain(`client_id=${CONSTANTS.GOOGLE_CLIENT_ID}`)
    expect(res.header.location).toContain(CONSTANTS.GOOGLE_AUTH_CALLBACK_URL)
  })

  it('builds the /authV2 redirect using /public/google/sso', async () => {
    const res = await supertest(buildApp()).get('/public/v8/google/authV2')
    expect(res.header.location).toContain('/public/google/sso')
  })

  it('builds the /testauth redirect using the apis callback path', async () => {
    const res = await supertest(buildApp()).get('/public/v8/google/testauth')
    expect(res.header.location).toContain('/apis/public/v8/google/callback')
  })
})

describe('googleAuth /callback', () => {
  beforeEach(() => {
    mockedGetGoogleProfile.mockResolvedValue({ emailId: 'a@b.com', firstName: 'Jane', lastName: 'Doe' })
  })

  it('redirects new users to /public/welcome after creating their account', async () => {
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: '', rootOrgId: '', userExist: false })
    mockedCreateUserWithMailId.mockResolvedValue({ errMessage: '', userCreated: true, userId: 'user-1' })
    mockedUpdateKeycloakSession.mockResolvedValue({
      access_token: 'a', errMessage: '', keycloakSessionCreated: true, refresh_token: 'r',
    })

    const res = await supertest(buildApp()).get('/public/v8/google/callback')

    expect(res.status).toBe(302)
    expect(res.header.location).toMatch(/\/public\/welcome$/)
    expect(mockedCreateUserWithMailId).toHaveBeenCalledWith('a@b.com', 'Jane', 'Doe')
  })

  it('redirects an existing user to /page/home without creating an account', async () => {
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: '', rootOrgId: 'some-other-org', userExist: true })
    mockedUpdateKeycloakSession.mockResolvedValue({
      access_token: 'a', errMessage: '', keycloakSessionCreated: true, refresh_token: 'r',
    })

    const res = await supertest(buildApp()).get('/public/v8/google/callback')

    expect(res.header.location).toMatch(/\/page\/home$/)
    expect(mockedCreateUserWithMailId).not.toHaveBeenCalled()
  })

  it('treats an existing custodian-org user as first-time and redirects to /public/welcome', async () => {
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: '', rootOrgId: CONSTANTS.X_Channel_Id, userExist: true })
    mockedUpdateKeycloakSession.mockResolvedValue({
      access_token: 'a', errMessage: '', keycloakSessionCreated: true, refresh_token: 'r',
    })

    const res = await supertest(buildApp()).get('/public/v8/google/callback')

    expect(res.header.location).toMatch(/\/public\/welcome$/)
  })

  it('redirects to /public/logout with the error when the user lookup fails', async () => {
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: 'lookup failed', rootOrgId: '', userExist: false })

    const res = await supertest(buildApp()).get('/public/v8/google/callback')

    expect(res.header.location).toContain('/public/logout?error=')
    expect(mockedUpdateKeycloakSession).not.toHaveBeenCalled()
  })

  it('redirects to /public/logout with the error when account creation fails', async () => {
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: '', rootOrgId: '', userExist: false })
    mockedCreateUserWithMailId.mockResolvedValue({ errMessage: 'create failed', userCreated: false, userId: '' })

    const res = await supertest(buildApp()).get('/public/v8/google/callback')

    expect(res.header.location).toContain('/public/logout?error=')
    expect(mockedUpdateKeycloakSession).not.toHaveBeenCalled()
  })

  it('redirects to /public/logout with the error when the keycloak session cannot be created', async () => {
    mockedFetchUserByEmailId.mockResolvedValue({ errMessage: '', rootOrgId: 'org', userExist: true })
    mockedUpdateKeycloakSession.mockResolvedValue({
      access_token: '', errMessage: 'kc failed', keycloakSessionCreated: false, refresh_token: '',
    })

    const res = await supertest(buildApp()).get('/public/v8/google/callback')

    expect(res.header.location).toContain('/public/logout?error=')
  })

  it('redirects to /public/logout with the error when getGoogleProfile throws', async () => {
    mockedGetGoogleProfile.mockRejectedValue(new Error('profile fetch failed'))

    const res = await supertest(buildApp()).get('/public/v8/google/callback')

    expect(res.header.location).toContain('/public/logout?error=')
  })
})
