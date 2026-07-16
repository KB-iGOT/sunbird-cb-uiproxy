import axios from 'axios'
import express from 'express'
import jwt_decode from 'jwt-decode'
import querystring from 'querystring'
import uuid from 'uuid'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { getCurrnetExpiryTime } from '../utils/jwtHelper'
import { logDebug, logError } from '../utils/logger'
import { redis } from '../utils/redis'
import { createUserWithMailId, fetchUserByEmailId, updateKeycloakSession } from './ssoUserHelper'

export const ntpcAuth = express.Router()

ntpcAuth.get('/auth', async (req, res) => {
    logDebug('Received host : ' + req.hostname)
    const rawIiidem = Array.isArray(req.query.iiidem) ? req.query.iiidem[0] : req.query.iiidem
    const iiidemFlag = rawIiidem === '1'
    if (req.session) {
        req.session.ntpcIsEclogin = iiidemFlag
        logDebug('Stored ntpcIsEclogin=' + iiidemFlag)
    } else if (iiidemFlag) {
        logError('iiidem flag present but session not available to persist it')
    }
    const callbackHost = iiidemFlag ? CONSTANTS.IIIDEM_PORTAL_HOST : req.hostname
    const redirectUrl = 'https://' + callbackHost + CONSTANTS.NTPC_AUTH_CALLBACK_URL
    let oAuthParams = 'client_id=' + CONSTANTS.NTPC_CLIENT_ID
    oAuthParams = oAuthParams + '&redirect_uri=' + redirectUrl
    oAuthParams = oAuthParams + '&response_type=code'
    oAuthParams = oAuthParams + '&response_mode=query'
    oAuthParams = oAuthParams + '&scope=openid profile email User.Read'
    const state = uuid.v4()
    oAuthParams = oAuthParams + '&state=' + state
    // Store state in Redis with 5 minutes expiration
    await redis.set(`ntpc_auth_state:${state}`, 'VALID', 'EX', 300)
    const ntpcUrl = CONSTANTS.NTPC_AUTH_URL + '?' + oAuthParams
    res.redirect(ntpcUrl)
})

ntpcAuth.get('/login/callback', async (req, res) => {
    const host = req.get('host')
    if (!req.query.code) {
        logDebug('Received host : ' + host)
        logError('Failed to login in NTPC, authorization code is missing. Redirecting to /error')
        const errorMessage = 'Failed to login using NTPC. Your NTPC session has expired.'
            + ' Please logoff from NTPC and retry [Login with NTPC] option on iGOT Portal Login page.'
            + ' If issue persists, then please try the same in incognito/private window.'
        res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
        return
    }
    const state = req.query.state
    const stateKey = `ntpc_auth_state:${state}`
    const isStateValid = await redis.get(stateKey)
    if (!isStateValid) {
        logError('State validation failed or expired for state: ' + state)
        const errorMessage = 'Login failed. Security check failed or session expired. Please try again.'
        res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
        return
    }
    // Delete state after successful validation to prevent replay
    await redis.del(stateKey)
    logDebug('Received host :: ' + host)
    let resRedirectUrl = `https://${host}/page/home`
    if (host === CONSTANTS.IIIDEM_PORTAL_HOST) {
        resRedirectUrl = `https://${host}${CONSTANTS.EC_REDIRECT_PATH}`
    }
    try {
        const redirectUrl = 'https://' + req.hostname + CONSTANTS.NTPC_AUTH_CALLBACK_URL
        const tokenResponse = await axios({
            ...axiosRequestConfig,
            data: querystring.stringify({
                client_id: CONSTANTS.NTPC_CLIENT_ID,
                client_secret: CONSTANTS.NTPC_CLIENT_SECRET,
                code: decodeURIComponent(req.query.code as string),
                grant_type: 'authorization_code',
                redirect_uri: redirectUrl,
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            method: 'POST',
            url: CONSTANTS.NTPC_TOKEN_URL,
        })
        if (req.session) {
            req.session.ntpcToken = tokenResponse.data
            req.session.cookie.expires = new Date(getCurrnetExpiryTime(tokenResponse.data.access_token))
            logDebug('NTPC Token is set in request Session.' + tokenResponse.data.access_token)
        } else {
            logError('Failed to set NTPC token in req session. Session not available...')
        }
        // tslint:disable-next-line: no-any
        const decodedToken: any = jwt_decode(tokenResponse.data.access_token)
        const userOid = decodedToken.oid
        logDebug('User OID: ' + userOid)
        const userDetailResponse = await axios({
            ...axiosRequestConfig,
            headers: {
                Authorization: `Bearer ${tokenResponse.data.access_token}`,
            },
            method: 'GET',
            url: `https://graph.microsoft.com/v1.0/users/${userOid}`,
        })

        logDebug('User information from NTPC : ' + JSON.stringify(userDetailResponse.data))
        const loginId = userDetailResponse.data.mail
        if (!loginId) {
            const errorMessage = 'iGOT login failed. You must allow Email id on the consent form for Login. '
                + 'Please logout from NTPC and try iGOT Login with NTPC again.'
            // Redirect to the logout page with an error message
            res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
            return
        }

        let result: { errMessage: string, rootOrgId: string, userExist: boolean, }
        result = await fetchUserByEmailId(userDetailResponse.data.mail)
        logDebug('For NTPC emailId ? ' + userDetailResponse.data.mail + ', isUserExist ? ' + result.userExist
            + ', rootOrgId ? ' + result.rootOrgId + ', errorMessage ? ' + result.errMessage)
        let isFirstTimeUser = false
        if (result.errMessage === '') {
            let createResult: { errMessage: string, userCreated: boolean, userId: string }
            if (!result.userExist) {
                logDebug('iGOT User does not exist for NTPC email: ' + userDetailResponse.data.mail)
                const mobileNo = userDetailResponse.data.mobilePhone

                if (!loginId || !mobileNo) {
                    const errorMessage = 'NTPC user registration failed. You must allow Email id and Mobile number on the consent form. '
                        + 'Please logout from NTPC and try iGOT Login with NTPC again.'
                    // Redirect to the logout page with an error message
                    res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
                    return
                }
                createResult = await createUserWithMailId(userDetailResponse.data.mail,
                    userDetailResponse.data.givenName, userDetailResponse.data.surname, userDetailResponse.data.mobilePhone, 'ntpc')
                if (createResult.errMessage !== '') {
                    result.errMessage = createResult.errMessage
                }
                isFirstTimeUser = true
                logDebug('New user is created for NTPC email id:' + userDetailResponse.data.mail
                    + ', new User id:' + createResult.userId)
            } else {
                logDebug('User exists for NTPC email id:' + userDetailResponse.data.mail
                    + ', result.rootOrgId = ' + result.rootOrgId + ', XChannelId = ' + CONSTANTS.X_Channel_Id)
                if (result.rootOrgId !== '' && result.rootOrgId === CONSTANTS.X_Channel_Id) {
                    isFirstTimeUser = true
                }
            }
            if (result.errMessage === '') {
                let keycloakResult: {
                    access_token: string, errMessage: string, keycloakSessionCreated: boolean, refresh_token: string
                }
                keycloakResult = await updateKeycloakSession(userDetailResponse.data.mail, req, res)
                if (keycloakResult.errMessage !== '') {
                    logError('For NTPC emailId:' + userDetailResponse.data.mail
                        + ', Received a keycloak error: ' + keycloakResult.errMessage)
                    result.errMessage = keycloakResult.errMessage
                }
                logDebug('NTPC user session established in Keycloak: ' + JSON.stringify(keycloakResult))
            }
        }
        if (result.errMessage !== '') {
            logError('For NTPC emailId:' + userDetailResponse.data.mail
                + ', Received error from user search. Error Message: ' + result.errMessage)
            resRedirectUrl = `https://${host}/public/logout?error=` + encodeURIComponent(JSON.stringify(result.errMessage))
        } else {
            logDebug('NTPC login is successful for emailId:' + userDetailResponse.data.mail)
            if (isFirstTimeUser) {
                resRedirectUrl = `https://${host}/public/welcome`
            }
        }
    } catch (err) {
        logError('Failed to process callback API for NTPC code : ' + req.query.code + '..with the error: ' + JSON.stringify(err))
        resRedirectUrl = `https://${host}/public/logout?error=` + encodeURIComponent('Internal Server Error. Please contact administrator.')
    }
    res.redirect(resRedirectUrl)
})
