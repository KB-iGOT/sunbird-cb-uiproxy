import { Request, Response } from 'express'
import { getRootOrg } from '../../authoring/utils/header'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { sendUpstreamError } from '../../utils/errors'
import { logDebug, logError } from '../../utils/logger'
import { extractUserIdFromRequest, extractUserToken } from '../../utils/requestExtract'

// Axios config for NodeBB calls: api key + user token, plus any extra headers (e.g. rootOrg)
// tslint:disable-next-line: no-any
export function discussionHubRequestConfig(req: any, extraHeaders: object = {}) {
    return {
        ...axiosRequestConfig,
        headers: {
            Authorization: CONSTANTS.SB_API_KEY,
            ...extraHeaders,
            // tslint:disable-next-line: all
            'x-authenticated-user-token': extractUserToken(req),
        },
    }
}

// Logs and returns the caller's rootOrg and userId
export function logRequestContext(req: Request) {
    const rootOrg = getRootOrg(req)
    const userId = extractUserIdFromRequest(req)
    logDebug(`UserId: ${userId}, rootOrg: ${rootOrg}`)
    return { rootOrg, userId }
}

// Wraps a route handler so any failure is logged and the upstream error (or 500 {}) is sent back
export function discussionHubHandler(errorLabel: string, handle: (req: Request, res: Response) => Promise<void>) {
    return async (req: Request, res: Response) => {
        try {
            await handle(req, res)
        } catch (err) {
            logError(errorLabel, err)
            sendUpstreamError(res, err)
        }
    }
}
