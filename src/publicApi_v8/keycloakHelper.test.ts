jest.mock('keycloak-connect', () => jest.fn().mockImplementation(() => ({})))

jest.mock('../configs/session.config', () => ({
  getSessionConfig: jest.fn(() => ({ store: 'mock-store' })),
}))

jest.mock('../utils/permissionHelper', () => ({
  PERMISSION_HELPER: { getCurrentUserRoles: jest.fn() },
}))

jest.mock('../utils/request-adapter', () => ({
  request: { post: jest.fn() },
}))

import { CONSTANTS } from '../utils/env'
import { PERMISSION_HELPER } from '../utils/permissionHelper'
import { request } from '../utils/request-adapter'
import { getKeyCloakClient } from './keycloakHelper'

const mockedGetCurrentUserRoles = PERMISSION_HELPER.getCurrentUserRoles as jest.Mock
const mockedRequestPost = request.post as jest.Mock

// tslint:disable-next-line: no-any
function buildSession(overrides: any = {}): any {
  return { destroy: jest.fn(), ...overrides }
}

describe('getKeyCloakClient', () => {
  it('returns a keycloak client with authenticated/deauthenticated wired up', () => {
    const client = getKeyCloakClient()
    expect(typeof client.authenticated).toBe('function')
    expect(typeof client.deauthenticated).toBe('function')
  })
})

describe('authenticated', () => {
  it('calls next(null, "loggedin") when the roles lookup succeeds', async () => {
    mockedGetCurrentUserRoles.mockImplementation((_reqObj, cb) => cb(null))
    const client = getKeyCloakClient()
    const next = jest.fn()
    await client.authenticated({ session: buildSession() }, next)
    expect(next).toHaveBeenCalledWith(null, 'loggedin')
  })

  it('calls next(err, null) when the roles lookup fails', async () => {
    mockedGetCurrentUserRoles.mockImplementation((_reqObj, cb) => cb('roles failed'))
    const client = getKeyCloakClient()
    const next = jest.fn()
    await client.authenticated({ session: buildSession() }, next)
    expect(next).toHaveBeenCalledWith('roles failed', null)
  })
})

describe('deauthenticated', () => {
  it('cleans up the session without calling keycloak logout when there is no keycloak-token', async () => {
    const client = getKeyCloakClient()
    const session = buildSession()
    await client.deauthenticated({ session })
    expect(mockedRequestPost).not.toHaveBeenCalled()
    expect(session.destroy).toHaveBeenCalledTimes(1)
  })

  it('does not call keycloak logout when the token has no refresh_token', async () => {
    const client = getKeyCloakClient()
    const session = buildSession({ 'keycloak-token': JSON.stringify({ access_token: 'abc' }) })
    await client.deauthenticated({ session })
    expect(mockedRequestPost).not.toHaveBeenCalled()
    expect(session.destroy).toHaveBeenCalledTimes(1)
  })

  it('calls the keycloak logout endpoint with the google client credentials and refresh token', async () => {
    const client = getKeyCloakClient()
    const session = buildSession({ 'keycloak-token': JSON.stringify({ refresh_token: 'refresh-1' }) })
    await client.deauthenticated({ session })

    expect(mockedRequestPost).toHaveBeenCalledWith(
      expect.objectContaining({
        form: {
          client_id: CONSTANTS.KEYCLOAK_GOOGLE_CLIENT_ID,
          client_secret: CONSTANTS.KEYCLOAK_GOOGLE_CLIENT_SECRET,
          refresh_token: 'refresh-1',
        },
        url: expect.stringContaining(`/realms/${CONSTANTS.KEYCLOAK_REALM}/protocol/openid-connect/logout`),
      })
    )
    expect(session.destroy).toHaveBeenCalledTimes(1)
  })

  it('still cleans up the session when the logout call throws synchronously', async () => {
    mockedRequestPost.mockImplementation(() => {
      throw new Error('boom')
    })
    const client = getKeyCloakClient()
    const session = buildSession({ 'keycloak-token': JSON.stringify({ refresh_token: 'refresh-1' }) })
    await expect(client.deauthenticated({ session })).resolves.toBeUndefined()
    expect(session.destroy).toHaveBeenCalledTimes(1)
  })
})
