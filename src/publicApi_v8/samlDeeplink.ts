import express from 'express'
import uuid from 'uuid'
import { buildIgotSpLink } from '../configs/samlSpProviders.config'
import { CONSTANTS } from '../utils/env'
import { logDebug, logError, logInfo } from '../utils/logger'

export const samlDeeplink = express.Router()

/**
 * iGOT SAML SP deeplink.
 *   GET /public/v8/saml/deeplink            -> uses SAML_SP_DEFAULT_IDP (sbi)
 *   GET /public/v8/saml/deeplink?idp=sbi     -> explicit IdP client
 */
samlDeeplink.get('/deeplink', (req, res) => {
  // tslint:disable-next-line: no-any
  const query = req.query as any
  const idpClient = String(query.idp || CONSTANTS.SAML_SP_DEFAULT_IDP || '')
  logInfo('saml-test /deeplink: entered host=' + (req.get('host') || req.hostname)
    + ' idp=' + idpClient)
  if (!idpClient) {
    logError('saml-test /deeplink: missing idpClient, returning 400')
    res.status(400).json({ error: 'Missing IdP client. Pass ?idp=<idp> or set SAML_SP_DEFAULT_IDP.' })
    return
  }
  try {
    const host = req.get('host') || req.hostname
    const state = uuid.v4()
    const url = buildIgotSpLink(idpClient, host, state)
    logDebug('iGOT SAML deeplink built for idp=' + idpClient + ' -> ' + url)
    logInfo('saml-test /deeplink: redirecting to Keycloak login url for idp=' + idpClient)
    res.redirect(url)
  } catch (err) {
    logError('saml-test /deeplink: failed to build deeplink for idp=' + idpClient + ': ' + err)
    res.status(500).json({ error: CONSTANTS.INTERNAL_SERVER_ERR_MSG })
  }
})
