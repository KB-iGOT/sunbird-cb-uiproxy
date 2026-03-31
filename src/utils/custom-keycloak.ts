import * as express from 'express'
import expressSession from 'express-session'
import keycloakConnect from 'keycloak-connect'
import request from 'request'
import { getKeycloakConfig } from '../configs/keycloak.config'
import { CONSTANTS } from './env'
import { logDebug, logError } from './logger'
import { PERMISSION_HELPER } from './permissionHelper'
const async = require('async')

const composable = require('composable-middleware')

export class CustomKeycloak {
  private multiTenantKeycloak = new Map<string, keycloakConnect>()
  private readonly accessDeniedGuardCookie = 'kc_access_denied_guard'

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
    const middleware = composable(
      keycloak.middleware({
        admin: '/callback',
        logout: '/logout',
      })
    )
    middleware(req, res, next)
  }

  getKeyCloakObject(req: express.Request): keycloakConnect {
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
      this.multiTenantKeycloak.get('common')) as keycloakConnect
  }

  // tslint:disable-next-line: no-any
  authenticated = (reqObj: any, next: any) => {
    logDebug('Step 3: authenticated function', '------', new Date().toString())
    if (reqObj && reqObj.res) {
      reqObj.res.clearCookie(this.accessDeniedGuardCookie, { path: '/' })
    }
    reqObj.session.authenticated = true
    try {
      const userId = reqObj.kauth.grant.access_token.content.sub.split(':')
      reqObj.session.userId = userId[userId.length - 1]
      logDebug('userId ::', userId, '------', new Date().toString())
    } catch (err) {
      logError('userId conversation error' + reqObj.kauth.grant.access_token.content.sub, '------', new Date().toString())
    }
    const postLoginRequest = []
    // tslint:disable-next-line: no-any
    postLoginRequest.push((callback: any) => {
      PERMISSION_HELPER.getCurrentUserRoles(reqObj, callback)
    })

    // tslint:disable-next-line: no-any
    async.series(postLoginRequest, (err: any) =>  {
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
    delete reqObj.session.userRoles
    delete reqObj.session.userId
    delete reqObj.session.keycloakClientId
    delete reqObj.session.keycloakClientSecret
    if (reqObj.session) {
      reqObj.session.destroy()
    }
    logDebug(`${process.pid}: User Deauthenticated New`)
  }

  // tslint:disable-next-line: no-any
  deauthenticated = (reqObj: any) => {
    const keyCloakPropertyName = 'keycloak-token'
    if (reqObj.session.hasOwnProperty(keyCloakPropertyName)) {
      const keycloakToken = reqObj.session[keyCloakPropertyName]
      if (keycloakToken) {
        const tokenObject = JSON.parse(keycloakToken)
        const refreshToken = tokenObject.refresh_token
        if (refreshToken) {
          const host = reqObj.get('host')
          const urlValue = `https://${host}` + '/auth/realms/' + CONSTANTS.KEYCLOAK_REALM + '/protocol/openid-connect/logout'
          const formData: Record<string, string> = {
            client_id: 'portal',
            refresh_token: refreshToken,
          }

          if (reqObj.session.hasOwnProperty('keycloakClientId') && (reqObj.session.keycloakClientId !== '')) {
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
    delete reqObj.session.userRoles
    delete reqObj.session.userId
    delete reqObj.session.keycloakClientId
    delete reqObj.session.keycloakClientSecret
    reqObj.session.destroy()
    logDebug(`${process.pid}: User Deauthenticated`)
  }

  protect = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const keycloak = this.getKeyCloakObject(req)
    logDebug('Protect middleware called for url: ' + req.url)

    // Avoid circular object serialization (keycloak/session carry circular refs)
    // tslint:disable-next-line: no-any
    const safeStringify = (obj: any) => {
      try {
        return JSON.stringify(obj)
      } catch (err) {
        return '[object with circular reference]'
      }
    }

    logDebug('Keycloak object (safe dump): ' + safeStringify(keycloak))
    logDebug('Session object (safe dump): ' + safeStringify(req.session))
    return keycloak.protect()(req, res, next)
  }

  private clearAuthSession(req: express.Request, res: express.Response) {
    if (req.session) {
      req.session.destroy(() => {
        logDebug('CustomKeycloak: destroyed session during accessDenied')
      })
    }
    // Clear default express-session cookie to avoid stale/duplicate sid on next login.
    res.clearCookie('connect.sid', { path: '/' })
  }

  private generateKeyCloak(
    sessionConfig: expressSession.SessionOptions,
    url?: string,
    realm?: string
  ): keycloakConnect {
    const keycloak = new keycloakConnect(
      { store: sessionConfig.store },
      getKeycloakConfig(url, realm)
    )
    keycloak.authenticated = this.authenticated
    keycloak.deauthenticated = this.deauthenticatedNew
    // tslint:disable-next-line: no-any
    const keycloakAny = keycloak as any
    keycloakAny.accessDenied = (req: express.Request, res: express.Response) => {
      logError('CustomKeycloak: accessDenied invoked, clearing auth session and cookie')
      this.clearAuthSession(req, res)
      const hasGuardCookie = Boolean(req.cookies && req.cookies[this.accessDeniedGuardCookie])
      if (hasGuardCookie) {
        logError('CustomKeycloak: repeated accessDenied detected, stopping redirect loop')
        res.clearCookie(this.accessDeniedGuardCookie, { path: '/' })
        // Break loop by forcing a clean logout flow and normalized URL before next login.
        res.redirect('/apis/logout')
        return
      }
      // One retry only: set a short-lived guard cookie and redirect once.
      res.cookie(this.accessDeniedGuardCookie, '1', { httpOnly: true, maxAge: 10000, path: '/' })
      const retryPath = '/protected/v8/resource'
      res.redirect(retryPath)
    }
    return keycloak
  }
}
