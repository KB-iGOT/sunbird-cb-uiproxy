import axios, { AxiosResponse } from 'axios'
import { Request, Response, Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { sendUpstreamError } from '../utils/errors'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserToken } from '../utils/requestExtract'

const API_END_POINTS = {
    applicationTransition: `${CONSTANTS.KONG_API_BASE}/workflow/transition`,
    applicationTransitionV2: `${CONSTANTS.KONG_API_BASE}/workflow/v2/transition`,
    applicationsSearch: `${CONSTANTS.KONG_API_BASE}/workflow/applications/search`,
    historyBasedOnApplicationId: (applicationId: string) =>
        `${CONSTANTS.WORKFLOW_HANDLER_SERVICE_API_BASE}/v1/workflow/${applicationId}/history`,
    historyBasedOnWfId: (workflowId: string, applicationId: string) =>
        `${CONSTANTS.WORKFLOW_HANDLER_SERVICE_API_BASE}/v1/workflow/${workflowId}/${applicationId}/history`,
    nextActionSearch: (serviceName: string, state: string) =>
        `${CONSTANTS.KONG_API_BASE}/workflow/nextAction/${serviceName}/${state}`,
    profileApprovalSearch: `${CONSTANTS.KONG_API_BASE}/workflow/profile/approvalRequest/search`,
    userProfileUpdate: `${CONSTANTS.KONG_API_BASE}/workflow/updateUserProfileWF`,
    userWfFieldsSearch: `${CONSTANTS.KONG_API_BASE}/workflow/getUserWFApplicationFields`,
    userWfSearch: `${CONSTANTS.KONG_API_BASE}/workflow/getUserWF`,
    workflowProcess: (wfId: string) => `${CONSTANTS.KONG_API_BASE}/workflow/workflowProcess/${wfId}`,
}

export const workflowHandlerApi = Router()
const unknownError = 'Failed due to unknown reason'
const failedToProcess = 'Failed to process the request. '

const rootOrgHeaders = (req: Request) => ({
    Authorization: CONSTANTS.SB_API_KEY,
    rootOrg: req.headers.rootorg,
    // tslint:disable-next-line: all
    'x-authenticated-user-token': extractUserToken(req),
})

const orgHeaders = (req: Request) => ({
    ...rootOrgHeaders(req),
    org: req.headers.org,
})

const widHeader = (req: Request) => ({ wid: req.headers.wid })

// tslint:disable-next-line: no-any
const sessionRootOrgIdHeader = (req: any) => ({
    'x-authenticated-user-orgid': req && req.session && req.session.hasOwnProperty('rootOrgId')
        ? req.session.rootOrgId
        : '',
})

// Relays the upstream response; a call that has already answered (validation failure) resolves to undefined
const forwardToWorkflow = (call: (req: Request, res: Response) => Promise<AxiosResponse | undefined>) =>
    async (req: Request, res: Response) => {
        try {
            const response = await call(req, res)
            if (response) {
                res.status(response.status).send(response.data)
            }
        } catch (err) {
            logError(failedToProcess + err)
            sendUpstreamError(res, err, { error: unknownError })
        }
    }

// POSTs the request body with org headers, rejecting requests without rootOrg/org
const postWithOrg = (endPoint: string, extraHeaders: (req: Request) => object = () => ({})) =>
    forwardToWorkflow(async (req, res) => {
        if (!req.headers.rootorg || !req.headers.org) {
            res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
            return undefined
        }
        return axios.post(endPoint, req.body, {
            ...axiosRequestConfig,
            headers: { ...orgHeaders(req), ...extraHeaders(req) },
        })
    })

const getWithHeaders = (endPoint: (req: Request) => string, buildHeaders: (req: Request) => object = orgHeaders) =>
    forwardToWorkflow((req) => axios.get(endPoint(req), { ...axiosRequestConfig, headers: buildHeaders(req) }))

workflowHandlerApi.post('/transition', postWithOrg(API_END_POINTS.applicationTransition))

workflowHandlerApi.post('/applicationsSearch', postWithOrg(API_END_POINTS.applicationsSearch))

workflowHandlerApi.get('/nextActionSearch/:serviceName/:state', getWithHeaders((req) =>
    API_END_POINTS.nextActionSearch(req.params.serviceName, req.params.state)
))

workflowHandlerApi.get('/historyByApplicationIdAndWfId/:applicationId/:wfId', getWithHeaders((req) =>
    API_END_POINTS.historyBasedOnWfId(req.params.wfId, req.params.applicationId)
))

workflowHandlerApi.get('/workflowProcess/:wfId', getWithHeaders(
    (req) => API_END_POINTS.workflowProcess(req.params.wfId),
    rootOrgHeaders
))

workflowHandlerApi.get('/historyByApplicationId/:applicationId', getWithHeaders((req) =>
    API_END_POINTS.historyBasedOnApplicationId(req.params.applicationId)
))

workflowHandlerApi.post('/updateUserProfileWf', postWithOrg(API_END_POINTS.userProfileUpdate))

workflowHandlerApi.post('/userWfSearch', postWithOrg(API_END_POINTS.userWfSearch, widHeader))

workflowHandlerApi.post('/userWFApplicationFieldsSearch', postWithOrg(API_END_POINTS.userWfFieldsSearch, widHeader))

workflowHandlerApi.post('/profileApprovalSearch', postWithOrg(
    API_END_POINTS.profileApprovalSearch, sessionRootOrgIdHeader
))

workflowHandlerApi.post('/v2/transition', postWithOrg(API_END_POINTS.applicationTransitionV2))
