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

    if (req.path === '/logout') {
      // Derive post-logout destination: strip first subdomain
      // e.g. portal.dev.karmayogibharat.net -> https://dev.karmayogibharat.net
      let postLogoutRedirect = req.protocol + '://' + req.hostname + '/'
      try {
        const hostParts = req.hostname.split('.')
        if (hostParts.length > 2) {
          postLogoutRedirect = 'https://' + hostParts.slice(1).join('.') + '/'
        }
      } catch (_e) { /* keep default */ }

      logInfo('custom-keycloak middleware: /logout intercepted, postLogoutRedirect=' + postLogoutRedirect)

      // Terminate the Keycloak SSO session server-side via backchannel revocation
      // (POST to KC logout endpoint with refresh_token).
      // deauthenticatedNew only clears the local session; this.deauthenticated
      // also revokes the refresh_token at KC, killing the SSO session.
      this.deauthenticated(req)

      // Clear Keycloak cookies in the user's browser directly to terminate the SSO session
      // on the client side without showing Keycloak's logout confirmation page.
      const cookieNames = [
        'KEYCLOAK_IDENTITY',
        'KEYCLOAK_IDENTITY_LEGACY',
        'KEYCLOAK_SESSION',
        'KEYCLOAK_SESSION_LEGACY',
        'KC_RESTART',
      ]
      const cookiePaths = [
        '/auth/',
        `/auth/realms/${CONSTANTS.KEYCLOAK_REALM}/`,
        `/auth/realms/${CONSTANTS.KEYCLOAK_REALM}`,
        '/',
      ]
      let domainUrl = ''
      const host = req.get('host')
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

      cookieNames.forEach((cookieName) => {
        cookiePaths.forEach((cookiePath) => {
          res.clearCookie(cookieName, { path: cookiePath, secure: true })
          if (domainUrl) {
            res.clearCookie(cookieName, { domain: domainUrl, path: cookiePath, secure: true })
          }
        })
      })

      // Also clear local session cookies
      res.clearCookie('connect.sid', { httpOnly: true, secure: true })
      if (domainUrl) {
        res.clearCookie('connect.sid', { domain: domainUrl, httpOnly: false, path: '/', secure: true })
      }

      logInfo('custom-keycloak middleware: KC cookies cleared, redirecting to ' + postLogoutRedirect)
      res.redirect(postLogoutRedirect)
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
      const idTokenRaw: string = reqObj.kauth?.grant?.id_token?.token || ''
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
  deauthenticated = (reqObj: any) => {
    const keyCloakPropertyName = 'keycloak-token'

    // Check if session exists before attempting to access its properties
    if (!reqObj.session) {
      logDebug(`${process.pid}: User Deauthenticated - No session found`)
      return
    }

    if (reqObj.session.hasOwnProperty(keyCloakPropertyName)) {
      const keycloakToken = reqObj.session[keyCloakPropertyName]
      if (keycloakToken) {
        const tokenObject = JSON.parse(keycloakToken)
        const refreshToken = tokenObject.refresh_token
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
          logDebug('formData used in logout: ' + JSON.stringify(formData))
          try {
            request.post({
              form: formData,
              url: urlValue,
            })
          } catch (err) {
            // tslint:disable-next-line: no-console
            console.log('Failed to call keycloak logout API ', err, '------', new Date().toString())
          }

          if (reqObj.session.parichayToken) {
            logDebug('Parichay login found... trying to logout from Parichay...')
            try {
              request.get({
                headers: {
                  Authorization: reqObj.session.parichayToken.access_token,
                },
                url: CONSTANTS.PARICHAY_REVOKE_URL,
              }, (err, res, body) => {
                if (err) {
                  logError('Received error when calling Parichay logout... ')
                  logError(JSON.stringify(err))
                }
                if (res) {
                  logDebug('Received response from Parichay logout... ')
                  logDebug(JSON.stringify(res.body))
                }
                if (body) {
                  logDebug('Received body from Parichay logout...')
                  logDebug(JSON.stringify(body))
                }
              })
            } catch (err) {
              // tslint:disable-next-line: no-console
              console.log('Failed to call parichay revoke API ', err, '------', new Date().toString())
            }
          }
        } else {
          logError('Not able to retrieve refresh_token value from Session. Logout process failed.')
        }
      } else {
        logError('Not able to retrieve keycloak-token value from Session. Logout process failed.')
      }
    } else {
      logError('Session does not have property with name: ' + keyCloakPropertyName)
    }

    // Clean up session properties if session exists
    if (reqObj.session) {
      delete reqObj.session.userRoles
      delete reqObj.session.userId
      delete reqObj.session.keycloakClientId
      delete reqObj.session.keycloakClientSecret
      reqObj.session.destroy()
    }

    logDebug(`${process.pid}: User Deauthenticated`)
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
    ;(keycloak as any).logoutUrl = (redirectUrl: string): string => {
      // tslint:disable-next-line: no-any
      const cfg = (keycloak as any).config
      // Derive the root domain by stripping the first subdomain from the host.
      // e.g. https://portal.dev.karmayogibharat.net/... -> https://dev.karmayogibharat.net
      let postLogoutRedirect = redirectUrl
      try {
        const parsed = new URL(redirectUrl)
        const hostParts = parsed.hostname.split('.')
        if (hostParts.length > 2) {
          postLogoutRedirect = parsed.protocol + '//' + hostParts.slice(1).join('.') + '/'
        }
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
