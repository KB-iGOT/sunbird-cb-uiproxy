import { Router } from 'express'
import * as _ from 'lodash'
import { CONSTANTS } from '../utils/env'
import { logDebug } from '../utils/logger'
export const userAuthKeyCloakApi = Router()
export const userAuthKeyCloakEcApi = Router()
export const userAuthKeyCloakAssessmentLoginApi = Router()
const LOCALHOST = 'localhost'
const COOKIE_NAME = 'connect.sid'
const SAME_SITE_NONE = 'None'
const LOG_RECEIVED_QUERY = 'Received query param: '
const LOG_REDIRECT_URL = 'Received redirectUrl value : '
const LOG_AUTH = 'User is authenticated.. Updating Cookie with Secure and SameSite flags'
userAuthKeyCloakApi.get('/', (req, res) => {
    const host = req.get('host')
    let queryParam = ''
    let isLocal = 0
    let domain = ''
    logDebug(LOG_RECEIVED_QUERY  + JSON.stringify(req.query))
    if (req.session && req.session.authenticated) {
       logDebug(LOG_AUTH)
        if (host !== undefined) {
            if (host.includes(LOCALHOST)) {
                domain = LOCALHOST // For localhost, set domain to localhost
            } else {
                const hostParts = host.split('.')
                if (hostParts.length > 2) {
                    domain = '.' + hostParts.slice(1).join('.')
                } else {
                    domain = host
                }
            }
        }
        const COOKIE_NAME_NEW = COOKIE_NAME
        const COOKIE_OPTIONS = {
            httpOnly: true,
            secure: true,
        }
        res.clearCookie(COOKIE_NAME_NEW, {
                        COOKIE_OPTIONS,
          })
        res.cookie(COOKIE_NAME_NEW, req.cookies[COOKIE_NAME_NEW], { domain, maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
          sameSite: SAME_SITE_NONE, ...COOKIE_OPTIONS })

        // res.cookie('express.sid', req.cookies['express.sid'], {
        //     httpOnly: true,
        //     maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
        //     sameSite: 'Lax',
        //     secure: true,
        // })
    } 
    if (!_.isEmpty(req.query) && (req.query as any) !== 'protected/v8/resources') {
        queryParam = req.query.q as string
        if (queryParam && queryParam.includes(LOCALHOST)) {
            isLocal = 1
        }
        if (req.query.redirect_uri) {
            logDebug(LOG_REDIRECT_URL + req.query.redirect_uri)
            res.redirect(req.query.redirect_uri as string)
            return
        }
    } 
    let redirectUrl = ''
    if (isLocal) {
        redirectUrl = queryParam
    } else {
        // redirectUrl = `https://${host}${queryParam}` //   'https://' + host + '/page/home'
        redirectUrl = 'https://' + host + '/page/home'
    }
    res.redirect(redirectUrl)
})

userAuthKeyCloakEcApi.get('/', (req, res) => {
    const host = req.get('host')
    let queryParam = ''
    let isLocal = 0
    let domain = ''
    
    logDebug(LOG_RECEIVED_QUERY + JSON.stringify(req.query))
    if (req.session && req.session.authenticated) {
        logDebug(LOG_AUTH)
        if (host !== undefined) {
            if (host.includes(LOCALHOST)) {
                domain = LOCALHOST // For localhost, set domain to localhost
            } else {
                const hostParts = host.split('.')
                if (hostParts.length > 2) {
                    domain = '.' + hostParts.slice(1).join('.')
                } else {
                    domain = host
                }
            }
        }
        
        const COOKIE_NAME_EC = COOKIE_NAME
        const COOKIE_OPTIONS_EC = {
            httpOnly: true,
            secure: true,
        }
        res.clearCookie(COOKIE_NAME_EC, {
                        COOKIE_OPTIONS_EC,
          })
        res.cookie(COOKIE_NAME_EC, req.cookies[COOKIE_NAME_EC], { domain, maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
          sameSite: SAME_SITE_NONE, ...COOKIE_OPTIONS_EC })

        // res.cookie('express.sid', req.cookies['express.sid'], {
        //     httpOnly: true,
        //     maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
        //     sameSite: 'Lax',
        //     secure: true,
        // })
    }
    if (!_.isEmpty(req.query)) {
        queryParam = req.query.q
        if (queryParam && queryParam.includes(LOCALHOST)) {
            isLocal = 1
        }
        if (req.query.redirect_uri) {
            logDebug(LOG_REDIRECT_URL + req.query.redirect_uri)
            res.redirect(req.query.redirect_uri)
            return
        }
    }
    let redirectUrl = ''
    if (isLocal) {
        redirectUrl = queryParam
    } else if (queryParam && queryParam.includes('aiassessmentlogin')) {
        // tslint:disable-next-line: max-line-length
        redirectUrl = `${CONSTANTS.AI_ASSESSMENT_PORTAL_HOST}${CONSTANTS.AI_ASSESSMENT_REDIRECT_PATH}${queryParam}`
    } else {
        // tslint:disable-next-line: max-line-length
        redirectUrl = `${CONSTANTS.AI_ASSESSMENT_PORTAL_HOST}`
            + `${CONSTANTS.AI_ASSESSMENT_REDIRECT_PATH}` // 'https://' + host + '/page/home'
    }
    logDebug('Redirecting to: ' + redirectUrl)

    res.redirect(redirectUrl)
})
userAuthKeyCloakAssessmentLoginApi.get('/', (req, res) => {
    const host = req.get('host')
    let queryParam = ''
    let isLocal = 0
    let domain = ''
    logDebug(LOG_RECEIVED_QUERY + JSON.stringify(req.query))
    if (req.session && req.session.authenticated ) {
        logDebug(LOG_AUTH)
        if (host !== undefined) {
            if (host.includes(LOCALHOST)) {
                domain = LOCALHOST // For localhost, set domain to localhost
            } else {
                const hostParts = host.split('.')
                if (hostParts.length > 2) {
                    domain = '.' + hostParts.slice(1).join('.')
                } else {
                    domain = host
                }
            }
        }
        const COOKIE_NAME_ASSESSMENT = COOKIE_NAME
        const COOKIE_OPTIONS_ASSESSMENT = {
                httpOnly: true,
                secure: true,
            }
        res.clearCookie(COOKIE_NAME_ASSESSMENT, {
                        COOKIE_OPTIONS_ASSESSMENT,
          })
        res.cookie(COOKIE_NAME_ASSESSMENT, req.cookies[COOKIE_NAME_ASSESSMENT], { domain, maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
          sameSite: SAME_SITE_NONE, ...COOKIE_OPTIONS_ASSESSMENT })

        // res.cookie('express.sid', req.cookies['express.sid'], {
        //     httpOnly: true,
        //     maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
        //     sameSite: 'Lax',
        //     secure: true,
        // })
    }
    if (!_.isEmpty(req.query)) {
        queryParam = req.query.q
        if (queryParam && queryParam.includes(LOCALHOST)) {
            isLocal = 1
        }
        if (req.query.redirect_uri) {
            logDebug(LOG_REDIRECT_URL + req.query.redirect_uri)
            res.redirect(req.query.redirect_uri)
            return
        }
    }
    let redirectUrl = ''
    if (isLocal) {
        redirectUrl = queryParam
    } else if (queryParam && queryParam.includes('aiassessmentlogin')) {
        // tslint:disable-next-line: max-line-length
       redirectUrl = `${CONSTANTS.AI_ASSESSMENT_PORTAL_HOST}${CONSTANTS.AI_ASSESSMENT_REDIRECT_PATH}${queryParam}`

    } else {
        // tslint:disable-next-line: max-line-length
        redirectUrl = `${CONSTANTS.AI_ASSESSMENT_PORTAL_HOST}${CONSTANTS.AI_ASSESSMENT_REDIRECT_PATH}` //   'https://' + host + '/page/home'
    }
    logDebug('Redirecting to: ' + redirectUrl)

    res.redirect(redirectUrl)
})
