import { CONSTANTS } from '../utils/env'
import { buildIgotSpLink } from './samlSpProviders.config'

describe('buildIgotSpLink', () => {
  it('builds a Keycloak authorization URL with the expected fixed params', () => {
    const url = buildIgotSpLink('sbi', 'portal.example.com', 'state-123')
    const parsed = new URL(url)

    expect(parsed.origin + parsed.pathname).toBe(
      `${CONSTANTS.PORTAL_AUTH_SERVER_URL}/realms/${CONSTANTS.KEYCLOAK_REALM}/protocol/openid-connect/auth`
    )
    expect(parsed.searchParams.get('client_id')).toBe('portal')
    expect(parsed.searchParams.get('state')).toBe('state-123')
    expect(parsed.searchParams.get('scope')).toBe('openid')
    expect(parsed.searchParams.get('response_type')).toBe('code')
  })

  it('builds the redirect_uri from the host and the configured SAML redirect path', () => {
    const url = buildIgotSpLink('sbi', 'portal.example.com', 'state-123')
    const parsed = new URL(url)
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://portal.example.com' + CONSTANTS.SAML_SP_REDIRECT_PATH)
  })

  it('appends kc_idp_hint when an idpClient is given', () => {
    const url = buildIgotSpLink('sbi', 'portal.example.com', 'state-123')
    expect(new URL(url).searchParams.get('kc_idp_hint')).toBe('sbi')
  })

  it('omits kc_idp_hint when no idpClient is given', () => {
    const url = buildIgotSpLink('', 'portal.example.com', 'state-123')
    expect(new URL(url).searchParams.has('kc_idp_hint')).toBe(false)
  })
})
