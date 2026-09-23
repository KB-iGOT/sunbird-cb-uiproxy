jest.mock('googleapis', () => {
  const mockOAuth2Instance = {
    getToken: jest.fn(),
    setCredentials: jest.fn(),
  }
  const mockOAuth2Ctor = jest.fn().mockImplementation(() => mockOAuth2Instance)
  const mockOauth2Api = jest.fn()
  return {
    __mockOAuth2Ctor: mockOAuth2Ctor,
    __mockOAuth2Instance: mockOAuth2Instance,
    __mockOauth2Api: mockOauth2Api,
    google: {
      auth: { OAuth2: mockOAuth2Ctor },
      oauth2: mockOauth2Api,
    },
  }
})

jest.mock('./keycloakHelper', () => ({
  getKeyCloakClient: jest.fn(),
}))

import { CONSTANTS } from '../utils/env'
import { createConnection, createSession, getGoogleProfile, getQueryParams } from './googleOAuthHelper'
import { getKeyCloakClient } from './keycloakHelper'

// tslint:disable-next-line: no-var-requires
const { __mockOAuth2Ctor, __mockOAuth2Instance, __mockOauth2Api } = require('googleapis')
const mockedGetKeyCloakClient = getKeyCloakClient as jest.Mock

function buildReq(overrides: object = {}) {
  return { get: jest.fn().mockReturnValue('host.example.com'), query: {}, ...overrides }
}

describe('createConnection', () => {
  it('builds an OAuth2 client with the configured google credentials and callback redirect', () => {
    createConnection(buildReq())
    expect(__mockOAuth2Ctor).toHaveBeenCalledWith(
      CONSTANTS.GOOGLE_CLIENT_ID,
      CONSTANTS.GOOGLE_CLIENT_SECRET,
      'https://host.example.com/apis/public/v8/google/callback'
    )
  })
})

describe('getQueryParams', () => {
  it('encodes and joins the object as a query string', async () => {
    const qs = await getQueryParams({ a: '1', b: 'x y' })
    expect(qs).toBe('?a=1&b=x%20y')
  })
})

describe('getGoogleProfile', () => {
  it('returns the mapped profile on success', async () => {
    __mockOAuth2Instance.getToken.mockResolvedValue({ tokens: { access_token: 'tok' } })
    __mockOauth2Api.mockResolvedValue({
      userinfo: {
        get: jest.fn().mockResolvedValue({
          data: { email: 'a@b.com', family_name: 'Doe', given_name: 'Jane', name: 'Jane Doe' },
        }),
      },
    })

    const profile = await getGoogleProfile(buildReq({ query: { code: 'auth-code' } }))

    expect(profile).toEqual({ emailId: 'a@b.com', firstName: 'Jane', lastName: 'Doe', name: 'Jane Doe' })
    expect(__mockOAuth2Instance.getToken).toHaveBeenCalledWith('auth-code')
    expect(__mockOAuth2Instance.setCredentials).toHaveBeenCalledWith({ access_token: 'tok' })
  })

  it('returns an empty object when the user denied access', async () => {
    const profile = await getGoogleProfile(buildReq({ query: { error: 'access_denied' } }))
    expect(profile).toEqual({})
  })

  it('returns an empty object when fetching the token throws', async () => {
    __mockOAuth2Instance.getToken.mockRejectedValue(new Error('bad code'))
    const profile = await getGoogleProfile(buildReq({ query: { code: 'bad' } }))
    expect(profile).toEqual({})
  })
})

describe('createSession', () => {
  it('obtains a grant, stores it and resolves with access/refresh tokens on success', async () => {
    const grant = { access_token: { token: 'access-1' }, refresh_token: { token: 'refresh-1' } }
    const keycloakClient = {
      authenticated: jest.fn((_req, cb) => cb(null)),
      grantManager: { obtainDirectly: jest.fn().mockResolvedValue(grant) },
      storeGrant: jest.fn(),
    }
    mockedGetKeyCloakClient.mockReturnValue(keycloakClient)
    const req: { kauth: { grant?: unknown } } = { kauth: {} }

    const result = await createSession('a@b.com', req, {})

    expect(keycloakClient.grantManager.obtainDirectly).toHaveBeenCalledWith('a@b.com', undefined, undefined, 'offline_access')
    expect(keycloakClient.storeGrant).toHaveBeenCalledWith(grant, req, {})
    expect(req.kauth).toEqual({ grant })
    expect(result).toEqual({ access_token: 'access-1', refresh_token: 'refresh-1' })
  })

  it('rejects when obtaining the grant fails', async () => {
    const keycloakClient = {
      grantManager: { obtainDirectly: jest.fn().mockRejectedValue(new Error('bad creds')) },
    }
    mockedGetKeyCloakClient.mockReturnValue(keycloakClient)
    await expect(createSession('a@b.com', {}, {})).rejects.toThrow('unable to create session')
  })

  it('rejects when keycloak session creation fails', async () => {
    const grant = { access_token: { token: 'a' }, refresh_token: { token: 'r' } }
    const keycloakClient = {
      authenticated: jest.fn((_req, cb) => cb('auth failed')),
      grantManager: { obtainDirectly: jest.fn().mockResolvedValue(grant) },
      storeGrant: jest.fn(),
    }
    mockedGetKeyCloakClient.mockReturnValue(keycloakClient)
    await expect(createSession('a@b.com', { kauth: {} }, {})).rejects.toBe('GOOGLE_CREATE_SESSION_FAILED')
  })
})
