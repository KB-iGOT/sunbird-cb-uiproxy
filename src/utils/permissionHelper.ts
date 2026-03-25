const _                 = require('lodash')
import axios from 'axios'
import request from 'request'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from './env'
import { logError, logInfo, logDebug } from './logger'
import { extractUserToken } from './requestExtract'

export const PERMISSION_HELPER = {
    // tslint:disable-next-line: no-any
    setRolesData(reqObj: any, callback: any, body: any) {
        logInfo('permission helper:: setRolesData function ', '------', new Date().toString())
        // tslint:disable-next-line: no-any
        const userData: any = JSON.parse(body)
        logDebug(JSON.stringify(userData))
        if (reqObj.session) {
            reqObj.session.userId = userData.result.response.id ? userData.result.response.id : userData.result.response.userId
            reqObj.session.userName = userData.result.response.userName
            reqObj.session.firstName = userData.result.response.firstName
            reqObj.session.lastName = userData.result.response.lastName
            reqObj.session.userRoles = userData.result.response.roles
            reqObj.session.orgs = userData.result.response.organisations
            reqObj.session.rootOrgId = userData.result.response.rootOrgId
            reqObj.session.channel = userData.result.response.channel
            if (userData.result.response.hasOwnProperty('profileDetails') &&
                userData.result.response.profileDetails.hasOwnProperty('userRoles')) {
                reqObj.session.userPositions = userData.result.response.profileDetails.userRoles
            } else {
                reqObj.session.userPositions = []
            }
            if (!_.includes(reqObj.session.userRoles, 'PUBLIC')) {
                reqObj.session.userRoles.push('PUBLIC')
            }
            this.createNodeBBUser(reqObj, callback)
            // tslint:disable-next-line: no-any
            reqObj.session.save((error: any) => {
                if (error) {
                    logError('permissionHelper:: ERROR: Failed to save session with roles -- ', error)
                } else {
                    logInfo('permissionHelper:: SUCCESS: Session saved with roles at ' + new Date().toString())
                }
            })
        } else {
            callback('reqObj.session no session', null)
        }
        logDebug('permission helper:: setRolesData function end', '------', new Date().toString())
    },
    // tslint:disable-next-line: no-any
    setNodeBBUID(reqObj: any, callback: any, body: any) {
        logDebug('setNodeBBUID :: ', new Date().toString())
        // tslint:disable-next-line: no-any
        const nodeBBData: any = body
        if (reqObj.session) {
            reqObj.session.uid = nodeBBData.data.result.userId.uid
            logDebug('After appending uid to session', reqObj.session.uid)
        }
        // tslint:disable-next-line: no-any
        reqObj.session.save((error: any) => {
            if (error) {
              logError('reqObj.session.save error -- ', error, '------', new Date().toString())
              callback(null, null)
            } else {
               logDebug(`setNodeBBUID::Success of save -- reqObj.session ${new Date()}--- `)
               callback(null, nodeBBData)
            }
        })
    },
    // tslint:disable-next-line: no-any
    getCurrentUserRoles(reqObj: any, callback: any) {
        const userId = reqObj.session.userId
        logDebug('Step 3: getCurrentUserRoles for user ' + userId, '------', new Date().toString())
        const readUrl = `${CONSTANTS.KONG_API_BASE}/user/v2/read/` + userId
        const options = {
            headers: {
                Authorization: CONSTANTS.SB_API_KEY,
                'X-Channel-Id': CONSTANTS.X_Channel_Id,
                'x-authenticated-user-token': reqObj.kauth.grant.access_token.token,
                'x-authenticated-userid': userId,
            },
            url: readUrl,
        }
        // tslint:disable-next-line: no-any
        request.get(options, (err: any, _httpResponse: any, body: any) => {
            if (body) {
                // tslint:disable-next-line: no-any
                const userData: any = JSON.parse(body)
                if (userData.responseCode.toUpperCase() === 'OK') {
                    logDebug('Success user/v2/read::', '------', new Date().toString())
                    this.setRolesData(reqObj, callback, body)
                } else {
                    const errMsg = 'Failed to read the user with Id: ' + userId + 'Error: ' + userData.responseCode
                    logError(errMsg)
                    callback(errMsg, null)
                }
            }
            if (err) {
                logError('Making axios call to nodeBB ERROR -- ', err, '------', new Date().toString())
                callback(err, null)
            }
        })
    },
    // tslint:disable-next-line: no-any
    async createNodeBBUser(reqObj: any, callback: any) {
        const readUrl = `${CONSTANTS.KONG_API_BASE}/discussion/user/v1/create`

        // tslint:disable-next-line: no-commented-code
        const nodebbPayload =  {
            username: reqObj.session.userName,
            // tslint:disable-next-line: object-literal-sort-keys
            identifier: reqObj.session.userId,
            fullname: reqObj.session.firstName + ' ' + reqObj.session.lastName,
        }
        try {
            const nodeBBResp = await axios({
                ...axiosRequestConfig,
                data: { request: nodebbPayload },
                 headers: {
                    Authorization: CONSTANTS.SB_API_KEY,
                    // tslint:disable-next-line: all
                    'x-authenticated-user-token': extractUserToken(reqObj),
                },
                method: 'POST',
                url: readUrl,
            })
            if (nodeBBResp) {
                this.setNodeBBUID(reqObj, callback, nodeBBResp)
            }
        } catch (err) {
            logError('Making axios call to nodeBB ERROR -- ', err, '------', new Date().toString())
            callback(null, null)
          }
    },
}
