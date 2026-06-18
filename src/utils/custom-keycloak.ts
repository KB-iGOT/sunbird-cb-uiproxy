import * as express from 'express'
import expressSession from 'express-session'
import keycloakConnect from 'keycloak-connect'
import { getKeycloakConfig } from '../configs/keycloak.config'
import { CONSTANTS } from './env'
import { logDebug, logError, logInfo } from './logger'
import { PERMISSION_HELPER } from './permissionHelper'
import { request } from './request-adapter'
const async = require('async')

const composable = require('composable-middleware')

export class CustomKeycloak {
  private multiTenantKeycloak = new Map<string, InstanceType<typeof keycloakConnect>>()

  constructor(sessionConfig: expressSession.SessionOptions) {
    if (CONSTANTS.MULTI_TENANT_KEYCLOAK) {
      CONSTANTS.MULTI_TENANT_KEYCLOAK.split(';').forEach((v: string) => {
        const domainUrlMap = v.split(',')
        this.multiTenantKeycloak.set(
          domainUrlMap[0],
          this.generateKeyCloak(sessionConfig, domainUrlMap[1], domainUrlMap[2])
        )
      })
    }
    this.multiTenantKeycloak.set('common', this.generateKeyCloak(sessionConfig))
  }

  middleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const keycloak = this.getKeyCloakObject(req)

    // Intercept /logout before keycloak's middleware chain so we can read the
    // session and inject id_token_hint — required by KC18+ to auto-redirect
    // without showing the Keycloak logout confirmation page.
    if (req.url === '/logout') {
      // Preserve the incoming host so channel-specific domains (mdo/cbp/spv)
      // are redirected back to the same host after logout.
      const redirectHost = req.get('host') || req.hostname
      const postLogoutRedirect = 'https://' + redirectHost + '/'
      const ref = req.get('referer') || ''
      const hasSession = !!req.session
      const hasGrant = !!(req as any).kauth && !!(req as any).kauth.grant

      logInfo('custom-keycloak middleware: /logout intercepted, postLogoutRedirect=' + postLogoutRedirect)
      logInfo('custom-keycloak logout trace: host=' + redirectHost +
        ' hasSession=' + hasSession + ' hasGrant=' + hasGrant)
      if (ref) {
        logDebug('custom-keycloak logout trace: referer=' + ref)
      }

      // Build KC front-channel logout URL (OIDC RP-Initiated Logout).
      // After backchannel token revocation we must send the browser through
      // Keycloak's logout endpoint so KC clears its own browser session/cookies.
      // Without this the browser still holds a valid KC session, causing the app
      // to detect no local session and trigger /logout again — an infinite loop.
      const kcCfg = (keycloak as any).config
      const kcFrontChannelLogoutUrl = kcCfg.realmUrl +
        '/protocol/openid-connect/logout' +
        '?client_id=' + encodeURIComponent(kcCfg.clientId) +
        '&post_logout_redirect_uri=' + encodeURIComponent(postLogoutRedirect)

      // Check upfront whether the session has a live KC token.
      // If there is no keycloak-token the browser has no active KC session to
      // clear, so routing through KC front-channel logout would just cause KC
      // to redirect back immediately, restarting the loop.
      const hasKcSession = req.session && req.session.hasOwnProperty('keycloak-token')
      logInfo('custom-keycloak logout trace: hasKcSession=' + !!hasKcSession)

      const clearCookies = () => {
        const host = req.get('host')
        let domainUrl = ''
        if (host !== undefined) {
          if (host.includes('localhost')) {
            domainUrl = 'localhost'
          } else {
            const hostParts = host.split('.')
            if (hostParts.length > 2) {
              domainUrl = '.' + hostParts.slice(1).join('.')
            } else {
              domainUrl = host
            }
          }
        }
        res.clearCookie('connect.sid', { httpOnly: true, secure: true, })
        res.clearCookie('connect.sid', { domain: domainUrl, httpOnly: false, path: '/', secure: true, })
      }

      this.deauthenticated(req)
        .then(() => {
          clearCookies()
          if (hasKcSession) {
            // Active KC session existed — route through KC front-channel so
            // KC clears its own browser cookies before returning to the app.
            logInfo('custom-keycloak middleware: KC backchannel logout completed, ' +
              'redirecting through KC front-channel to ' + postLogoutRedirect)
            logInfo('custom-keycloak logout trace: kcFrontChannelLogoutUrl=' +
              kcFrontChannelLogoutUrl)
            res.redirect(kcFrontChannelLogoutUrl)
          } else {
            // No KC session token in store — redirect straight to the app to
            // avoid an empty KC logout round-trip that would restart the loop.
            logInfo('custom-keycloak middleware: no KC session found, ' +
              'redirecting directly to ' + postLogoutRedirect)
            res.redirect(postLogoutRedirect)
          }
        })
        .catch((err) => {
          logError('custom-keycloak middleware: deauthenticated failed: ' + err)
          logInfo('custom-keycloak logout trace: fallback redirect=' + postLogoutRedirect)
          clearCookies()
          res.redirect(postLogoutRedirect)
        })
      return
    }

    const middleware = composable(
      keycloak.middleware({
        admin: '/callback',
        logout: '/logout',
      })
    )
    middleware(req, res, next)
  }

  getKeyCloakObject(req: express.Request): InstanceType<typeof keycloakConnect> {
    const rootOrg =
      (req.headers ? req.header('rootOrg') : '') || (req.cookies ? req.cookies.rootorg : '')
    let domain = ''
    if (rootOrg) {
      this.multiTenantKeycloak.forEach((_value, key) => {
        if (key.toLowerCase().includes(rootOrg.toLowerCase())) {
          domain = key
        }
      })
    }

    return (this.multiTenantKeycloak.get(req.hostname) ||
      this.multiTenantKeycloak.get(domain) ||
      this.multiTenantKeycloak.get('common'))
  }

  // tslint:disable-next-line: no-any
  authenticated = (reqObj: any, next: any) => {
    logDebug('Step 3: authenticated function', '------', new Date().toString())
    reqObj.session.authenticated = true

    // Persist id_token at login so it remains available at logout time.
    // Keycloak 24+ no longer returns id_token in token-refresh responses,
    // so we cannot rely on session['keycloak-token'] containing it later.
    try {
      const idTokenRaw: string =
        (reqObj.kauth &&
          reqObj.kauth.grant &&
          reqObj.kauth.grant.id_token &&
          reqObj.kauth.grant.id_token.token) ||
        ''
      if (idTokenRaw) {
        reqObj.session.idToken = idTokenRaw
      }
    } catch (_e) { /* ignore */ }

    try {
      // Log token information safely without circular references
      // tslint:disable: whitespace
      const tokenInfo = {
        contentSub: reqObj.content?.sub,
        hasContent: !!reqObj.content,
        hasKauth: !!reqObj.kauth,
        kauthSub: reqObj.kauth?.grant?.access_token?.content?.sub,
      }

      // tslint:enable: whitespace
      logDebug('KC24 test ::', '------', JSON.stringify(tokenInfo))

      let userId: string

      // Handle Keycloak 24 format (direct token structure)
      if (reqObj.content && reqObj.content.sub) {
        const userIdParts = reqObj.content.sub.split(':')
        userId = userIdParts[userIdParts.length - 1]
        reqObj.session.userId = userId
        logDebug(
          'KC24 format - userId extracted from reqObj.content.sub:',
          userId,
          '------',
          new Date().toString()
        )
      } else if (
        reqObj.kauth &&
        reqObj.kauth.grant &&
        reqObj.kauth.grant.access_token &&
        reqObj.kauth.grant.access_token.content &&
        reqObj.kauth.grant.access_token.content.sub
      ) {
        const userIdParts = reqObj.kauth.grant.access_token.content.sub.split(':')
        userId = userIdParts[userIdParts.length - 1]
        reqObj.session.userId = userId
        logDebug(
          'KC7 format - userId extracted from reqObj.kauth.grant.access_token.content.sub:',
          userId,
          '------',
          new Date().toString()
        )
      } else {
        throw new Error('Unable to extract user ID from token - unsupported token format')
      }

      logDebug('userId ::', userId, '------', new Date().toString())
    } catch (err: any) {
      // tslint:disable: whitespace
      const errorMsg = reqObj.content?.sub ||
        reqObj.kauth?.grant?.access_token?.content?.sub ||
        'unknown token format'
      // tslint:enable: whitespace
      logError(
        'userId conversation error: ' + errorMsg + ' - ' + (err.message || err),
        '------',
        new Date().toString()
      )
      // Set a fallback userId to prevent undefined issues
      // tslint:disable-next-line: whitespace
      if (reqObj.content?.sub) {
        try {
          const userIdParts = reqObj.content.sub.split(':')
          reqObj.session.userId = userIdParts[userIdParts.length - 1]
          logDebug('Fallback userId set from content.sub:', reqObj.session.userId, '------', new Date().toString())
        } catch (fallbackErr) {
          logError('Failed to set fallback userId', '------', new Date().toString())
        }
      }
    }
    const postLoginRequest = []
    // tslint:disable-next-line: no-any
    postLoginRequest.push((callback: any) => {
      PERMISSION_HELPER.getCurrentUserRoles(reqObj, callback)
    })

    // tslint:disable-next-line: no-any
    async.series(postLoginRequest, (err: any) => {
      if (err) {
        logError('error loggin in user', '------', new Date().toString())
        next(err, null)
      } else {
        logDebug(`${process.pid}: User authenticated`, '------', new Date().toString())
        next(null, 'loggedin')
      }
    })
  }

  // tslint:disable-next-line: no-any
  deauthenticatedNew = (reqObj: any) => {
    if (reqObj.session) {
      delete reqObj.session.userRoles
      delete reqObj.session.userId
      delete reqObj.session.keycloakClientId
      delete reqObj.session.keycloakClientSecret
      reqObj.session.destroy()
    }
    logDebug(`${process.pid}: User Deauthenticated New`)
  }

  // tslint:disable-next-line: no-any
  deauthenticated = async (reqObj: any) => {
    const keyCloakPropertyName = 'keycloak-token'

    logInfo(`custom-keycloak deauthenticated: Method started for PID ${process.pid}`)

    // Check if session exists before attempting to access its properties
    if (!reqObj.session) {
      logError(`${process.pid}: User Deauthenticated - No session found`)
      return
    }

    if (reqObj.session.hasOwnProperty(keyCloakPropertyName)) {
      const keycloakToken = reqObj.session[keyCloakPropertyName]
      if (keycloakToken) {
        let tokenObject: any
        try {
          tokenObject = JSON.parse(keycloakToken)
        } catch (parseErr) {
          logError('custom-keycloak deauthenticated: Failed to parse keycloak-token: ' + parseErr)
        }

        const refreshToken = tokenObject ? tokenObject.refresh_token : null
        if (refreshToken) {

          const urlValue = `${CONSTANTS.PORTAL_AUTH_SERVER_URL}/realms/${CONSTANTS.KEYCLOAK_REALM}/protocol/openid-connect/logout`
          const formData: Record<string, string> = {
            client_id: 'portal',
            refresh_token: refreshToken,
          }

          if (reqObj.session.hasOwnProperty('keycloakClientId') && reqObj.session.keycloakClientId !== '') {
            formData.client_id = reqObj.session.keycloakClientId
            formData.client_secret = reqObj.session.keycloakClientSecret
          }

          logInfo(
            `custom-keycloak deauthenticated: Calling Keycloak backchannel logout URL: ${urlValue} ` +
            `with client_id: ${formData.client_id}`
          )
          logDebug('formData used in logout: ' + JSON.stringify(formData))

          try {
            await new Promise<void>((resolve, reject) => {
              request.post({
                form: formData,
                url: urlValue,
              }, (err: any, res: any, body: any) => {
                if (err) {
                  logError(
                    'custom-keycloak deauthenticated: Keycloak backchannel logout request failed with error: ' +
                    JSON.stringify(err)
                  )
                  reject(err)
                } else {
                  const statusCode = res ? res.statusCode : 'unknown'
                  logInfo(`custom-keycloak deauthenticated: Keycloak backchannel logout responded with status code: ${statusCode}`)
                  logDebug('Keycloak backchannel logout body: ' + JSON.stringify(body))
                  resolve()
                }
              })
            })
          } catch (err) {
            logError('custom-keycloak deauthenticated: Caught exception during Keycloak logout request: ' + err)
          }

          if (reqObj.session.parichayToken) {
            logInfo('custom-keycloak deauthenticated: Parichay login found... trying to logout from Parichay...')
            try {
              await new Promise<void>((resolve) => {
                request.get({
                  headers: {
                    Authorization: reqObj.session.parichayToken.access_token,
                  },
                  url: CONSTANTS.PARICHAY_REVOKE_URL,
                }, (err: any, res: any, body: any) => {
                  if (err) {
                    logError('custom-keycloak deauthenticated: Received error when calling Parichay logout: ' + JSON.stringify(err))
                  } else {
                    const statusCode = res ? res.statusCode : 'unknown'
                    logInfo(`custom-keycloak deauthenticated: Parichay logout completed with status code: ${statusCode}`)
                    logDebug('Parichay logout body: ' + JSON.stringify(body))
                  }
                  resolve()
                })
              })
            } catch (err) {
              logError('custom-keycloak deauthenticated: Failed to call parichay revoke API: ' + err)
            }
          }
        } else {
          logError('custom-keycloak deauthenticated: Not able to retrieve refresh_token value from Session. Logout process failed.')
        }
      } else {
        logError('custom-keycloak deauthenticated: Not able to retrieve keycloak-token value from Session. Logout process failed.')
      }
    } else {
      logError('custom-keycloak deauthenticated: Session does not have property with name: ' + keyCloakPropertyName)
    }

    // Clean up session properties if session exists
    if (reqObj.session) {
      logInfo('custom-keycloak deauthenticated: Cleaning session and starting destroy')
      delete reqObj.session.userRoles
      delete reqObj.session.userId
      delete reqObj.session.keycloakClientId
      delete reqObj.session.keycloakClientSecret
      if (typeof reqObj.session.destroy === 'function') {
        try {
          await new Promise<void>((resolve) => {
            reqObj.session.destroy((err: any) => {
              if (err) {
                logError('custom-keycloak deauthenticated: Error destroying session: ' + err)
              } else {
                logInfo('custom-keycloak deauthenticated: Express session successfully destroyed in store')
              }
              resolve()
            })
          })
        } catch (err) {
          logError('custom-keycloak deauthenticated: Exception during session destroy: ' + err)
        }
      }
    }

    logInfo(`custom-keycloak deauthenticated: Method completed for PID ${process.pid}`)
  }

  protect = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const keycloak = this.getKeyCloakObject(req)
    return keycloak.protect()(req, res, next)
  }

  private generateKeyCloak(
    sessionConfig: expressSession.SessionOptions,
    url?: string,
    realm?: string
  ): InstanceType<typeof keycloakConnect> {
    const keycloak = new keycloakConnect(
      { store: sessionConfig.store },
      getKeycloakConfig(url, realm)
    )
      // Override logoutUrl to use OIDC RP-Initiated Logout spec (Keycloak 18+).
      // Keycloak 18+ requires post_logout_redirect_uri + client_id instead of redirect_uri.
      // tslint:disable-next-line: no-any align
      ; (keycloak as any).logoutUrl = (redirectUrl: string): string => {
        // tslint:disable-next-line: no-any
        const cfg = (keycloak as any).config
        // Preserve the exact host from redirectUrl to avoid cross-channel fallback
        // (e.g. cbp.qa... should not be rewritten to qa...).
        let postLogoutRedirect = redirectUrl
        try {
          const parsed = new URL(redirectUrl)
          postLogoutRedirect = parsed.protocol + '//' + parsed.host + '/'
        } catch (_e) { /* keep original redirectUrl if parsing fails */ }
        return cfg.realmUrl +
          '/protocol/openid-connect/logout' +
          '?client_id=' + encodeURIComponent(cfg.clientId) +
          '&post_logout_redirect_uri=' + encodeURIComponent(postLogoutRedirect)
      }
    // tslint:disable-next-line: no-any
    keycloak.authenticated = this.authenticated as any
    keycloak.deauthenticated = this.deauthenticatedNew
    return keycloak
  }
}
