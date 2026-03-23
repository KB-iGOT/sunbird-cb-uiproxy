const keycloak = require('keycloak-connect')
const async = require('async')
import { getOAuthKeycloakConfig } from '../configs/keycloak.config'
import { getSessionConfig } from '../configs/session.config'
import { CONSTANTS } from '../utils/env'
import { logError, logDebug } from '../utils/logger'
import { PERMISSION_HELPER } from '../utils/permissionHelper'
import { request } from '../utils/request-adapter'

export function getKeyCloakClient() {
    const sessionConfig = getSessionConfig()
    const keycloakObj = new keycloak({ store: sessionConfig.store }, getOAuthKeycloakConfig())
    keycloakObj.authenticated = authenticated
    keycloakObj.deauthenticated = deauthenticated
    return keycloakObj
}

// tslint:disable-next-line: no-any
const deauthenticated = async (reqObj: any) => {
    logDebug('keycloakHelper::deauthenticated...')
    const keyCloakPropertyName = 'keycloak-token'
    if (reqObj.session.hasOwnProperty(keyCloakPropertyName)) {
      const keycloakToken = reqObj.session[keyCloakPropertyName]
      if (keycloakToken) {
        const tokenObject = JSON.parse(keycloakToken)
        const refreshToken = tokenObject.refresh_token
        if (refreshToken) {
          const host = reqObj.get('host')
          const urlValue = `https://${host}` + '/auth/realms/' + CONSTANTS.KEYCLOAK_REALM + '/protocol/openid-connect/logout'
          try {
              request.post({
                  form: {
                      client_id: CONSTANTS.KEYCLOAK_GOOGLE_CLIENT_ID,
                      client_secret: CONSTANTS.KEYCLOAK_GOOGLE_CLIENT_SECRET,
                      refresh_token: refreshToken,
                  },
                  url: urlValue,
              })
          } catch (err) {
              // tslint:disable-next-line: no-console
              console.log('Failed to call keycloak logout API ', err, '------', new Date().toString())
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
    reqObj.session.destroy()
    logDebug(`${process.pid}: User Deauthenticated`)
}

// tslint:disable-next-line: no-any
const authenticated = async (reqObj: any, next: any) => {
    logDebug('keycloakHelper::authenticated...')
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
