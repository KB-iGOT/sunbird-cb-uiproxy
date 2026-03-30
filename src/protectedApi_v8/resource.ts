import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logDebug, logInfo } from '../utils/logger'
const _                 = require('lodash')
export const userAuthKeyCloakApi = Router()
export const userAuthKeyCloakEcApi = Router()
userAuthKeyCloakApi.get('/', (req, res) => {
    const host = req.get('host')
    let queryParam = ''
    let isLocal = 0
    let domain = ''
    logDebug('Received query param: ' + JSON.stringify(req.query))
    if (req.session && req.session.authenticated ) {
        logDebug('User is authenticated.. Updating Cookie with Secure and SameSite flags')
        if (host !== undefined) {
            if (host.includes('localhost')) {
                domain = 'localhost' // For localhost, set domain to localhost
            } else {
                const hostParts = host.split('.')
                if (hostParts.length > 2) {
                    domain = '.' + hostParts.slice(1).join('.')
                } else {
                    domain = host
                }
            }
        }
        const COOKIE_NAME = 'connect.sid'
        const COOKIE_OPTIONS = {
                httpOnly: true,
                secure: true,
            }
        res.clearCookie(COOKIE_NAME, {
                        COOKIE_OPTIONS,
          })
        res.cookie(COOKIE_NAME, req.cookies[COOKIE_NAME], { domain, maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
          sameSite: 'None', ...COOKIE_OPTIONS })

        // res.cookie('express.sid', req.cookies['express.sid'], {
        //     httpOnly: true,
        //     maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
        //     sameSite: 'Lax',
        //     secure: true,
        // })
    }
    if (!_.isEmpty(req.query)) {
        queryParam = req.query.q
        if (queryParam && queryParam.includes('localhost')) {
            isLocal = 1
        }
        if (req.query.redirect_uri) {
            logDebug('Received redirectUrl value : ' + req.query.redirect_uri)
            res.redirect(req.query.redirect_uri)
            return
        }
    }
    let redirectUrl = ''
    if (isLocal) {
        redirectUrl = queryParam
    } else {
        redirectUrl = `https://${host}${queryParam}` //   'https://' + host + '/page/home'
    }
    res.redirect(redirectUrl)
})

userAuthKeyCloakEcApi.get('/', (req, res) => {
    const host = req.get('host')
    let queryParam = ''
    let isLocal = 0
    let domain = ''
    logDebug('Received query param: ' + JSON.stringify(req.query))
    if (req.session && req.session.authenticated ) {
        logDebug('User is authenticated.. Updating Cookie with Secure and SameSite flags')
        if (host !== undefined) {
            if (host.includes('localhost')) {
                domain = 'localhost' // For localhost, set domain to localhost
            } else {
                const hostParts = host.split('.')
                if (hostParts.length > 2) {
                    domain = '.' + hostParts.slice(1).join('.')
                } else {
                    domain = host
                }
            }
        }
        const COOKIE_NAME = 'connect.sid'
        const COOKIE_OPTIONS = {
                httpOnly: true,
                secure: true,
            }
        res.clearCookie(COOKIE_NAME, {
                        COOKIE_OPTIONS,
          })
        res.cookie(COOKIE_NAME, req.cookies[COOKIE_NAME], { domain, maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
          sameSite: 'None', ...COOKIE_OPTIONS })

        // res.cookie('express.sid', req.cookies['express.sid'], {
        //     httpOnly: true,
        //     maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
        //     sameSite: 'Lax',
        //     secure: true,
        // })
    }
    if (!_.isEmpty(req.query)) {
        queryParam = req.query.q
        if (queryParam && queryParam.includes('localhost')) {
            isLocal = 1
        }
        if (req.query.redirect_uri) {
            logDebug('Received redirectUrl value : ' + req.query.redirect_uri)
            res.redirect(req.query.redirect_uri)
            return
        }
    }
    let redirectUrl = ''
    if (isLocal) {
        redirectUrl = queryParam
    } else {
        redirectUrl = `${CONSTANTS.IIM_PORTAL_HOST}${CONSTANTS.EC_REDIRECT_PATH}${queryParam}` //   'https://' + host + '/page/home'
    }
    logDebug('Redirecting to: ' + redirectUrl)

    res.redirect(redirectUrl)
})
