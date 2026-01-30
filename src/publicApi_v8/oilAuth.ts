import axios from 'axios'
import express from 'express'
import uuid from 'uuid'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { getCurrnetExpiryTime } from '../utils/jwtHelper'
import { logError, logInfo } from '../utils/logger'
import { redis } from '../utils/redis'
import { createUserWithMailId, fetchUserByEmailId, updateKeycloakSession } from './ssoUserHelper'

export const oilAuth = express.Router()

oilAuth.get('/auth', async (req, res) => {
    logInfo('Received host : ' + req.hostname)
    const rawIiidem = Array.isArray(req.query.iiidem) ? req.query.iiidem[0] : req.query.iiidem
    const iiidemFlag = rawIiidem === '1'
    if (req.session) {
        req.session.oilIsEclogin = iiidemFlag
        logInfo('Stored oilIsEclogin=' + iiidemFlag)
    } else if (iiidemFlag) {
        logError('iiidem flag present but session not available to persist it')
    }
    const callbackHost = iiidemFlag ? CONSTANTS.IIIDEM_PORTAL_HOST : req.hostname
    const redirectUrl = 'https://' + callbackHost + CONSTANTS.OIL_AUTH_CALLBACK_URL
    let oAuthParams = 'client_id=' + CONSTANTS.OIL_CLIENT_ID
    oAuthParams = oAuthParams + '&redirect_uri=' + redirectUrl
    oAuthParams = oAuthParams + '&response_type=code'
    oAuthParams = oAuthParams + '&response_mode=query'
    oAuthParams = oAuthParams + '&scope=openid profile email User.Read'
    const state = uuid.v4()
    oAuthParams = oAuthParams + '&state=' + state
    // Store state in Redis with 5 minutes expiration
    await redis.set(`oil_auth_state:${state}`, 'VALID', 'EX', 300)
    const oilUrl = CONSTANTS.OIL_AUTH_URL + '?' + oAuthParams
    res.redirect(oilUrl)
})

oilAuth.get('/login/callback', async (req, res) => {
    const host = req.get('host')
    if (!req.query.code) {
        logInfo('Received host : ' + host)
        logError('Failed to login in OIL, authorization code is missing. Redirecting to /error')
        const errorMessage = 'Failed to login using OIL. Your OIL session has expired.'
            + ' Please logoff from OIL and retry [Login with OIL] option on iGOT Portal Login page.'
            + ' If issue persists, then please try the same in incognito/private window.'
        res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
        return
    }
    const state = req.query.state
    const stateKey = `oil_auth_state:${state}`
    const isStateValid = await redis.get(stateKey)
    if (!isStateValid) {
        logError('State validation failed or expired for state: ' + state)
        const errorMessage = 'Login failed. Security check failed or session expired. Please try again.'
        res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
        return
    }
    // Delete state after successful validation to prevent replay
    await redis.del(stateKey)
    logInfo('Received host :: ' + host)
    let resRedirectUrl = `https://${host}/page/home`
    if (host === CONSTANTS.IIIDEM_PORTAL_HOST) {
        resRedirectUrl = `https://${host}${CONSTANTS.EC_REDIRECT_PATH}`
    }
    try {
        const redirectUrl = 'https://' + req.hostname + CONSTANTS.OIL_AUTH_CALLBACK_URL
        const tokenResponse = await axios({
            ...axiosRequestConfig,
            data: {
                client_id: CONSTANTS.OIL_CLIENT_ID,
                client_secret: CONSTANTS.OIL_CLIENT_SECRET,
                code: decodeURIComponent(req.query.code),
                grant_type: 'authorization_code',
                redirect_uri: redirectUrl,
            },
            method: 'POST',
            url: CONSTANTS.OIL_TOKEN_URL,
        })
        if (req.session) {
            req.session.oilToken = tokenResponse.data
            req.session.cookie.expires = new Date(getCurrnetExpiryTime(tokenResponse.data.access_token))
            logInfo('OIL Token is set in request Session.' + tokenResponse.data.access_token)
        } else {
            logError('Failed to set OIL token in req session. Session not available...')
        }
        const userDetailResponse = await axios({
            ...axiosRequestConfig,
            headers: {
                Authorization: tokenResponse.data.access_token,
            },
            method: 'GET',
            url: CONSTANTS.OIL_USER_DETAILS_URL,
        })

        logInfo('User information from OIL : ' + JSON.stringify(userDetailResponse.data))
        const loginId = userDetailResponse.data.loginId
        if (!loginId) {
            const errorMessage = 'iGOT login failed. You must allow Email id on the consent form for Login. '
                + 'Please logout from OIL and try iGOT Login with OIL again.'
            // Redirect to the logout page with an error message
            res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
            return
        }

        let result: { errMessage: string, rootOrgId: string, userExist: boolean, }
        result = await fetchUserByEmailId(userDetailResponse.data.loginId)
        logInfo('For OIL emailId ? ' + userDetailResponse.data.loginId + ', isUserExist ? ' + result.userExist
            + ', rootOrgId ? ' + result.rootOrgId + ', errorMessage ? ' + result.errMessage)
        let isFirstTimeUser = false
        if (result.errMessage === '') {
            let createResult: { errMessage: string, userCreated: boolean, userId: string }
            if (!result.userExist) {
                logInfo('iGOT User does not exist for OIL email: ' + userDetailResponse.data.loginId)
                const mobileNo = userDetailResponse.data.MobileNo

                if (!loginId || !mobileNo) {
                    const errorMessage = 'OIL user registration failed. You must allow Email id and Mobile number on the consent form. '
                        + 'Please logout from OIL and try iGOT Login with OIL again.'
                    // Redirect to the logout page with an error message
                    res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errorMessage))
                    return
                }
                createResult = await createUserWithMailId(userDetailResponse.data.loginId,
                    userDetailResponse.data.FirstName, userDetailResponse.data.LastName, userDetailResponse.data.MobileNo)
                if (createResult.errMessage !== '') {
                    result.errMessage = createResult.errMessage
                }
                isFirstTimeUser = true
                logInfo('New user is created for OIL email id:' + userDetailResponse.data.loginId
                    + ', new User id:' + createResult.userId)
            } else {
                logInfo('User exists for OIL email id:' + userDetailResponse.data.loginId
                    + ', result.rootOrgId = ' + result.rootOrgId + ', XChannelId = ' + CONSTANTS.X_Channel_Id)
                if (result.rootOrgId !== '' && result.rootOrgId === CONSTANTS.X_Channel_Id) {
                    isFirstTimeUser = true
                }
            }
            if (result.errMessage === '') {
                let keycloakResult: {
                    access_token: string, errMessage: string, keycloakSessionCreated: boolean, refresh_token: string
                }
                keycloakResult = await updateKeycloakSession(userDetailResponse.data.loginId, req, res)
                if (keycloakResult.errMessage !== '') {
                    logError('For OIL emailId:' + userDetailResponse.data.loginId
                        + ', Received a keycloak error: ' + keycloakResult.errMessage)
                    result.errMessage = keycloakResult.errMessage
                }
                logInfo('OIL user session established in Keycloak: ' + JSON.stringify(keycloakResult))
            }
        }
        if (result.errMessage !== '') {
            logError('For OIL emailId:' + userDetailResponse.data.loginId
                + ', Received error from user search. Error Message: ' + result.errMessage)
            resRedirectUrl = `https://${host}/public/logout?error=` + encodeURIComponent(JSON.stringify(result.errMessage))
        } else {
            logInfo('OIL login is successful for emailId:' + userDetailResponse.data.loginId)
            if (isFirstTimeUser) {
                resRedirectUrl = `https://${host}/public/welcome`
            }
        }
    } catch (err) {
        logError('Failed to process callback API for OIL code : ' + req.query.code + '..with the error: ' + JSON.stringify(err))
        resRedirectUrl = `https://${host}/public/logout?error=` + encodeURIComponent('Internal Server Error. Please contact administrator.')
    }
    res.redirect(resRedirectUrl)
})
