import { CONSTANTS } from '../utils/env'
import { getKeycloakConfig, getOAuthKeycloakConfig } from './keycloak.config'

describe('getKeycloakConfig', () => {
  it('falls back to the configured realm and auth server url when none are given', () => {
    const config = getKeycloakConfig()
    expect(config.realm).toBe(CONSTANTS.KEYCLOAK_REALM)
    expect(config['auth-server-url']).toBe(CONSTANTS.PORTAL_AUTH_SERVER_URL)
    expect(config.resource).toBe('portal')
    expect(config['ssl-required']).toBe('external')
    expect(config['public-client']).toBe(true)
    expect(config['bearer-only']).toBe(false)
    expect(config['confidential-port']).toBe(0)
    expect(config['realm-public-key']).toBe(CONSTANTS.KEYCLOAK_PUBLIC_KEY)
  })

  it('uses the given realm and url when provided', () => {
    const config = getKeycloakConfig('https://tenant.example.com', 'tenant-realm')
    expect(config.realm).toBe('tenant-realm')
    expect(config['auth-server-url']).toBe('https://tenant.example.com')
  })

  it('uses the given url but falls back to the default realm when realm is omitted', () => {
    const config = getKeycloakConfig('https://tenant.example.com')
    expect(config.realm).toBe(CONSTANTS.KEYCLOAK_REALM)
    expect(config['auth-server-url']).toBe('https://tenant.example.com')
  })
})

describe('getOAuthKeycloakConfig', () => {
  it('builds an OAuth keycloak config from the google client constants', () => {
    const config = getOAuthKeycloakConfig()
    expect(config).toEqual({
      bearerOnly: true,
      credentials: { secret: CONSTANTS.KEYCLOAK_GOOGLE_CLIENT_SECRET },
      realm: CONSTANTS.PORTAL_REALM,
      resource: CONSTANTS.KEYCLOAK_GOOGLE_CLIENT_ID,
      serverUrl: CONSTANTS.PORTAL_AUTH_SERVER_URL,
    })
  })
})
