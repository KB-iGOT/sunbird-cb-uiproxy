import { Router } from 'express'
import { CONSTANTS } from '../utils/env'
import { logDebug, logInfo } from '../utils/logger'
export const userAuthKeyCloakApi = Router()
export const userAuthKeyCloakEcApi = Router()
userAuthKeyCloakApi.get('/', (req, res) => {
    const host = req.get('host')
    let queryParam = ''
    let isLocal = 0
    let domain = ''
    logInfo('resource.ts userAuthKeyCloakApi: handler entered', { host, query: req.query })
    logDebug('Received query param: ' + JSON.stringify(req.query))
    if (req.session && req.session.authenticated) {
        logInfo('resource.ts userAuthKeyCloakApi: session is authenticated, updating connect.sid cookie')
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
        logInfo('resource.ts userAuthKeyCloakApi: resolved cookie domain', { domain })
        const COOKIE_NAME = 'connect.sid'
        const COOKIE_OPTIONS = {
            httpOnly: true,
            secure: true,
        }
        res.clearCookie(COOKIE_NAME, {
            COOKIE_OPTIONS,
        })
        res.cookie(COOKIE_NAME, req.cookies[COOKIE_NAME], {
            domain, maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
            sameSite: 'none', ...COOKIE_OPTIONS,
        })

        // res.cookie('express.sid', req.cookies['express.sid'], {
        //     httpOnly: true,
        //     maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
        //     sameSite: 'Lax',
        //     secure: true,
        // })
    } else {
        logInfo('resource.ts userAuthKeyCloakApi: session NOT authenticated', {
            hasSession: !!req.session,
            authenticated: req.session && req.session.authenticated,
        })
    }
    if (!_.isEmpty(req.query) && req.query !== 'protected/v8/resources') {
        queryParam = req.query.q as string
        logInfo('resource.ts userAuthKeyCloakApi: query params present',
            { q: queryParam, redirect_uri: req.query.redirect_uri })
        if (queryParam && queryParam.includes('localhost')) {
            isLocal = 1
            logInfo('resource.ts userAuthKeyCloakApi: detected localhost in q param, isLocal=1')
        }
        if (req.query.redirect_uri) {
            logInfo('resource.ts userAuthKeyCloakApi: redirect_uri param present, redirecting to',
                { redirect_uri: req.query.redirect_uri })
            logDebug('Received redirectUrl value : ' + req.query.redirect_uri)
            res.redirect(req.query.redirect_uri as string)
            return
        }
    } else {
        logInfo('resource.ts userAuthKeyCloakApi: no query params '
            + '(or query matched excluded pattern), will use default redirect')
    }
    let redirectUrl = ''
    if (isLocal) {
        redirectUrl = queryParam
        logInfo('resource.ts userAuthKeyCloakApi: isLocal=1, redirecting to queryParam', { redirectUrl })
    } else {
        // redirectUrl = `https://${host}${queryParam}` //   'https://' + host + '/page/home'
        redirectUrl = 'https://' + host + '/page/home'
        logInfo('resource.ts userAuthKeyCloakApi: redirecting to /page/home', { redirectUrl })
    }
    res.redirect(redirectUrl)
})

userAuthKeyCloakEcApi.get('/', (req, res) => {
    const host = req.get('host')
    let queryParam = ''
    let isLocal = 0
    let domain = ''
    logInfo('resource.ts userAuthKeyCloakEcApi: handler entered', { host, query: req.query })
    logDebug('Received query param: ' + JSON.stringify(req.query))
    if (req.session && req.session.authenticated) {
        logInfo('resource.ts userAuthKeyCloakEcApi: session is authenticated, updating connect.sid cookie')
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
        logInfo('resource.ts userAuthKeyCloakEcApi: resolved cookie domain', { domain })
        const COOKIE_NAME = 'connect.sid'
        const COOKIE_OPTIONS = {
            httpOnly: true,
            secure: true,
        }
        res.clearCookie(COOKIE_NAME, {
            COOKIE_OPTIONS,
        })
        res.cookie(COOKIE_NAME, req.cookies[COOKIE_NAME], {
            domain, maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
            sameSite: 'none', ...COOKIE_OPTIONS,
        })

        // res.cookie('express.sid', req.cookies['express.sid'], {
        //     httpOnly: true,
        //     maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
        //     sameSite: 'Lax',
        //     secure: true,
        // })
    } else {
        logInfo('resource.ts userAuthKeyCloakEcApi: session NOT authenticated', {
            hasSession: !!req.session,
            authenticated: req.session && req.session.authenticated,
        })
    }
    if (!_.isEmpty(req.query)) {
        queryParam = req.query.q as string
        logInfo('resource.ts userAuthKeyCloakEcApi: query params present',
            { q: queryParam, redirect_uri: req.query.redirect_uri })
        if (queryParam && queryParam.includes('localhost')) {
            isLocal = 1
            logInfo('resource.ts userAuthKeyCloakEcApi: detected localhost in q param, isLocal=1')
        }
        if (req.query.redirect_uri) {
            logInfo('resource.ts userAuthKeyCloakEcApi: redirect_uri param present, redirecting to',
                { redirect_uri: req.query.redirect_uri })
            logDebug('Received redirectUrl value : ' + req.query.redirect_uri)
            res.redirect(req.query.redirect_uri as string)
            return
        }
    } else {
        logInfo('resource.ts userAuthKeyCloakEcApi: no query params, will use AI assessment default redirect')
    }
    let redirectUrl = ''
    if (isLocal) {
        redirectUrl = queryParam
        logInfo('resource.ts userAuthKeyCloakEcApi: isLocal=1, redirecting to queryParam', { redirectUrl })
    } else if (queryParam && queryParam.includes('aiassessmentlogin')) {
        // tslint:disable-next-line: max-line-length
        redirectUrl = `${CONSTANTS.AI_ASSESSMENT_PORTAL_HOST}${CONSTANTS.AI_ASSESSMENT_REDIRECT_PATH}${queryParam}`
        logInfo('resource.ts userAuthKeyCloakEcApi: aiassessmentlogin path', { redirectUrl })
    } else {
        // tslint:disable-next-line: max-line-length
        redirectUrl = `${CONSTANTS.AI_ASSESSMENT_PORTAL_HOST}`
            + `${CONSTANTS.AI_ASSESSMENT_REDIRECT_PATH}${queryParam}` // 'https://' + host + '/page/home'
        logInfo('resource.ts userAuthKeyCloakEcApi: default AI assessment redirect', { redirectUrl })
    }
    logDebug('Redirecting to: ' + redirectUrl)

    res.redirect(redirectUrl)
})
