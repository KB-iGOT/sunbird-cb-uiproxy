import express from 'express'
import uuid from 'uuid'
import { buildIgotSpLink } from '../configs/samlSpProviders.config'
import { CONSTANTS } from '../utils/env'
import { logDebug, logError, logInfo } from '../utils/logger'

export const samlAuth = express.Router()

/**
 * iGOT SP-initiated SAML login link (iGOT/Keycloak is the SP).
 * The IdP is appended via kc_idp_hint and is configurable/appendable.
 *
 *   GET /public/v8/saml/sp-link            -> uses SAML_SP_DEFAULT_IDP (sbi)
 *   GET /public/v8/saml/sp-link?idp=sbi    -> explicit IdP client
 *   GET /public/v8/saml/sp-link?idp=sbi&redirect=true -> 302 to the login link
 */
samlAuth.get('/sp-link', (req, res) => {
  // tslint:disable-next-line: no-any
  const query = req.query as any
  const idpClient = String(query.idp || CONSTANTS.SAML_SP_DEFAULT_IDP || '')
  logInfo('saml-test /sp-link: entered host=' + (req.get('host') || req.hostname)
    + ' idp=' + idpClient + ' redirect=' + String(query.redirect))
  if (!idpClient) {
    logError('saml-test /sp-link: missing idpClient, returning 400')
    res.status(400).json({ error: 'Missing IdP client. Pass ?idp=<idp> or set SAML_SP_DEFAULT_IDP.' })
    return
  }
  try {
    const host = req.get('host') || req.hostname
    const state = uuid.v4()
    const url = buildIgotSpLink(idpClient, host, state)
    logDebug('iGOT SAML SP link built for idp=' + idpClient + ' -> ' + url)

    if (String(query.redirect) === 'true') {
      logInfo('saml-test /sp-link: redirecting to Keycloak login url for idp=' + idpClient)
      res.redirect(url)
      return
    }
    logInfo('saml-test /sp-link: returning JSON login url for idp=' + idpClient)
    res.status(200).json({ idpClient, url })
  } catch (err) {
    logError('saml-test /sp-link: failed to build SP link for idp=' + idpClient + ': ' + err)
    res.status(500).json({ error: CONSTANTS.INTERNAL_SERVER_ERR_MSG })
  }
})
