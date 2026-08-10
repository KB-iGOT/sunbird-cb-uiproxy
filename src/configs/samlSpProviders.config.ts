import { URLSearchParams } from 'url'
import { CONSTANTS } from '../utils/env'
import { logInfo } from '../utils/logger'

/**
 * iGOT SP-initiated SAML login link builder.
 *
 * iGOT (Keycloak) is the Service Provider (SP). The external IdP (e.g. SBI) is
 * appended via the broker hint (kc_idp_hint) so the same link works for any IdP
 * just by changing the appended idp value — "based on IdP client it is appendable".
 *
 * The Keycloak OIDC endpoint is derived from the existing auth-server + realm
 * config (PORTAL_AUTH_SERVER_URL, KEYCLOAK_REALM); client_id/scope are the
 * standard portal login values. The SAML-specific bits are env-tunable:
 *   SAML_SP_REDIRECT_PATH, SAML_SP_IDP_HINT_PARAM, SAML_SP_DEFAULT_IDP
 *
 * Example (idpClient = "sbi"):
 *   https://portal.uat.karmayogibharat.net/auth/realms/sunbird/protocol/openid-connect/auth
 *     ?client_id=portal&state=<uuid>
 *     &redirect_uri=https%3A%2F%2F...%2Fprotected%2Fv8%2Fresource%2F%3Fauth_callback%3D1
 *     &scope=openid&response_type=code&kc_idp_hint=sbi
 *
 * The redirect_uri is the same callback the normal login flow uses
 * (/protected/v8/resource/?auth_callback=1); resource.ts lands the user on
 * /page/home by default after the code exchange.
 */
export function buildIgotSpLink(idpClient: string, host: string, state: string): string {
  // Keycloak OIDC authorization endpoint, derived from the existing auth-server + realm config.
  const loginBaseUrl = `${CONSTANTS.PORTAL_AUTH_SERVER_URL}/realms/${CONSTANTS.KEYCLOAK_REALM}/protocol/openid-connect/auth`
  const redirectUri = 'https://' + host + CONSTANTS.SAML_SP_REDIRECT_PATH
  logInfo('saml-test buildIgotSpLink: idpClient=' + idpClient + ' host=' + host
    + ' loginBaseUrl=' + loginBaseUrl + ' redirectUri=' + redirectUri)
  const params = new URLSearchParams()
  params.append('client_id', 'portal')
  params.append('state', state)
  // Same callback the normal login flow (keycloak-connect protect) uses; URLSearchParams
  // handles the encoding, so redirectUri is passed through as-is.
  params.append('redirect_uri', redirectUri)
  params.append('scope', 'openid')
  params.append('response_type', 'code')
  if (idpClient) {
    params.append('kc_idp_hint', idpClient)
  }
  const loginUrl = loginBaseUrl + '?' + params.toString()
  logInfo('saml-test buildIgotSpLink: constructed loginUrl=' + loginUrl)
  return loginUrl
}
