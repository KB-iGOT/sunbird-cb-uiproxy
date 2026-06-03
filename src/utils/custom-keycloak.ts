import * as express from 'express'
import expressSession from 'express-session'
import keycloakConnect from 'keycloak-connect'
import request from 'request'
import { getKeycloakConfig } from '../configs/keycloak.config'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'
import { PERMISSION_HELPER } from './permissionHelper'

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
    logInfo('Step 3: authenticated function', '------', new Date().toString())

    // Ensure session object exists
    if (!reqObj.session) {
      reqObj.session = {}
    }

    reqObj.session.authenticated = true

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
     logInfo('KC24 test ::', '------', JSON.stringify(tokenInfo))

     let userId: string

      // Handle Keycloak 24 format (direct token structure)
     if (reqObj.content && reqObj.content.sub) {
        const userIdParts = reqObj.content.sub.split(':')
        userId = userIdParts[userIdParts.length - 1]
        reqObj.session.userId = userId
        logInfo(
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
        logInfo(
          'KC7 format - userId extracted from reqObj.kauth.grant.access_token.content.sub:',
          userId,
          '------',
          new Date().toString()
        )
      } else {
        throw new Error('Unable to extract user ID from token - unsupported token format')
      }

     logInfo('userId ::', userId, '------', new Date().toString())
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
          logInfo('Fallback userId set from content.sub:', reqObj.session.userId, '------', new Date().toString())
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
        logInfo(`${process.pid}: User authenticated`, '------', new Date().toString())
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
    logInfo(`${process.pid}: User Deauthenticated New`)
  }

  // tslint:disable-next-line: no-any
  deauthenticated = (reqObj: any) => {
    const keyCloakPropertyName = 'keycloak-token'

    // Check if session exists before attempting to access its properties
    if (!reqObj.session) {
      logInfo(`${process.pid}: User Deauthenticated - No session found`)
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
          logInfo('formData used in logout: ' + JSON.stringify(formData))
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
            logInfo('Parichay login found... trying to logout from Parichay...')
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
                  logInfo('Received response from Parichay logout... ')
                  logInfo(JSON.stringify(res.body))
                }
                if (body) {
                  logInfo('Received body from Parichay logout...')
                  logInfo(JSON.stringify(body))
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

    logInfo(`${process.pid}: User Deauthenticated`)
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
      return cfg.realmUrl +
        '/protocol/openid-connect/logout' +
        '?client_id=' + encodeURIComponent(cfg.clientId) +
        '&post_logout_redirect_uri=' + encodeURIComponent(redirectUrl)
    }
    // tslint:disable-next-line: no-any
    keycloak.authenticated = this.authenticated as any
    keycloak.deauthenticated = this.deauthenticatedNew
    return keycloak
  }
}
