jest.mock('axios', () => jest.fn())
jest.mock('./keycloakHelper', () => ({ getKeyCloakClient: jest.fn() }))

import axios from 'axios'
import { CONSTANTS } from '../utils/env'
import { createUserWithMailId, fetchUserByEmailId, updateKeycloakSession } from './ssoUserHelper'
import { getKeyCloakClient } from './keycloakHelper'

const mockedAxios = axios as unknown as jest.Mock
const mockedGetKeyCloakClient = getKeyCloakClient as jest.Mock

describe('fetchUserByEmailId', () => {
  it('reports the user as non-existent when the search finds nobody', async () => {
    mockedAxios.mockResolvedValue({ data: { responseCode: 'OK', result: { response: { count: 0 } } } })
    const result = await fetchUserByEmailId('a@b.com')
    expect(result).toEqual({ errMessage: '', rootOrgId: '', userExist: false })
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ request: expect.objectContaining({ filters: { email: 'a@b.com' } }) }),
        method: 'POST',
        url: `${CONSTANTS.LEARNER_SERVICE_API_BASE}/private/user/v1/search`,
      })
    )
  })

  it('searches by phone when the identifier is not an email', async () => {
    mockedAxios.mockResolvedValue({ data: { responseCode: 'OK', result: { response: { count: 0 } } } })
    await fetchUserByEmailId('9999999999')
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ request: expect.objectContaining({ filters: { phone: '9999999999' } }) }) })
    )
  })

  it('reports an existing, enabled user', async () => {
    mockedAxios.mockResolvedValue({
      data: {
        responseCode: 'OK',
        result: { response: { content: [{ rootOrgId: 'org-1', status: 1 }], count: 1 } },
      },
    })
    const result = await fetchUserByEmailId('a@b.com')
    expect(result).toEqual({ errMessage: '', rootOrgId: 'org-1', userExist: true })
  })

  it('flags a disabled account', async () => {
    mockedAxios.mockResolvedValue({
      data: { responseCode: 'OK', result: { response: { content: [{ status: 0 }], count: 1 } } },
    })
    const result = await fetchUserByEmailId('a@b.com')
    expect(result.errMessage).toBe('Account Disabled. Please contact Admin.')
  })

  it('flags more than one matching account', async () => {
    mockedAxios.mockResolvedValue({ data: { responseCode: 'OK', result: { response: { count: 2 } } } })
    const result = await fetchUserByEmailId('a@b.com')
    expect(result.errMessage).toBe('More than one user account exists. Please contact Admin.')
  })

  it('flags a non-OK response code', async () => {
    mockedAxios.mockResolvedValue({ data: { responseCode: 'FAILED' } })
    const result = await fetchUserByEmailId('a@b.com')
    expect(result.errMessage).toBe('Failed to verify email exist. Internal Server Error.')
  })
})

describe('createUserWithMailId', () => {
  it('creates a user against the parichay signup endpoint by default', async () => {
    mockedAxios.mockResolvedValue({ data: { params: { status: 'SUCCESS' }, result: { userId: 'user-1' } } })
    const result = await createUserWithMailId('a@b.com', 'Jane', 'Doe')
    expect(result).toEqual({ errMessage: '', userCreated: true, userId: 'user-1' })
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${CONSTANTS.KONG_API_BASE}/user/v5/parichay/create` })
    )
  })

  it('uses the ntpc endpoint when source is ntpc', async () => {
    mockedAxios.mockResolvedValue({ data: { params: { status: 'SUCCESS' }, result: { userId: 'user-1' } } })
    await createUserWithMailId('a@b.com', 'Jane', 'Doe', '', 'ntpc')
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: `${CONSTANTS.KONG_API_BASE}/user/v5/ntpc/create` })
    )
  })

  it('reports a failure when signup does not return SUCCESS', async () => {
    mockedAxios.mockResolvedValue({ data: { params: { status: 'FAILED' } } })
    const result = await createUserWithMailId('a@b.com', 'Jane', 'Doe')
    expect(result.errMessage).toBe('SIGN_UP_ERR-FAILED_TO_CREATE_USER')
    expect(result.userCreated).toBe(false)
  })

  it('surfaces the upstream error message when the signup call rejects', async () => {
    mockedAxios.mockRejectedValue({ response: { data: { params: { errmsg: 'email already exists' } } } })
    const result = await createUserWithMailId('a@b.com', 'Jane', 'Doe')
    expect(result.errMessage).toBe('email already exists')
  })
})

describe('updateKeycloakSession', () => {
  // tslint:disable-next-line: no-any
  function buildReq(): any {
    return { kauth: {}, session: {} }
  }

  it('obtains a grant, stores the session and returns the tokens', async () => {
    const grant = {
      access_token: { content: { sub: 'f:org:user-1' }, token: 'access-1' },
      refresh_token: { token: 'refresh-1' },
    }
    // tslint:disable-next-line: no-any
    mockedGetKeyCloakClient.mockReturnValue({
      authenticated: jest.fn((_req: any, cb: any) => cb(null)),
      grantManager: { obtainDirectly: jest.fn().mockResolvedValue(grant) },
      storeGrant: jest.fn(),
    })
    const req = buildReq()

    const result = await updateKeycloakSession('a@b.com', req, {})

    expect(result).toEqual({
      access_token: 'access-1', errMessage: '', keycloakSessionCreated: true, refresh_token: 'refresh-1',
    })
    expect(req.kauth.grant).toBe(grant)
  })

  it('reports an error message when obtaining the grant throws', async () => {
    mockedGetKeyCloakClient.mockReturnValue({
      grantManager: { obtainDirectly: jest.fn().mockRejectedValue(new Error('bad creds')) },
    })
    const result = await updateKeycloakSession('a@b.com', buildReq(), {})
    expect(result.errMessage).toBe('FAILED_TO_CREATE_KEYCLOAK_SESSION')
    expect(result.keycloakSessionCreated).toBe(false)
  })

  it('reports an error message when the keycloak authenticated callback errors', async () => {
    const grant = {
      access_token: { content: { sub: 'f:org:user-1' }, token: 'access-1' },
      refresh_token: { token: 'refresh-1' },
    }
    mockedGetKeyCloakClient.mockReturnValue({
      // tslint:disable-next-line: no-any
      authenticated: jest.fn((_req: any, cb: any) => cb('auth failed')),
      grantManager: { obtainDirectly: jest.fn().mockResolvedValue(grant) },
      storeGrant: jest.fn(),
    })
    const result = await updateKeycloakSession('a@b.com', buildReq(), {})
    expect(result.errMessage).toBe('FAILED_TO_CREATE_KEYCLOAK_SESSION')
  })
})
