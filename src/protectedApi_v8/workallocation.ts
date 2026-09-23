import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { Request, Response, Router } from 'express'

import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { sendUpstreamError } from '../utils/errors'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractAuthorizationFromRequest, extractUserId, extractUserToken } from '../utils/requestExtract'

const workallocationV1Path = 'v1/workallocation'
const workallocationV2Path = 'v2/workallocation'
const API_END_POINTS = {
    addAllocationEndPoint: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/add`,
    addWorkOrderEndPoint: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/add/workorder`,
    copyWorkOrderEndPoint: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/copy/workOrder`,
    getPdf: (id: string) => `${CONSTANTS.KONG_API_BASE}/getWOPdf/${id}`,
    getUserBasicDetails: (userId: string) => `${CONSTANTS.KONG_API_BASE}/${workallocationV2Path}/user/basicInfo/${userId}`,
    getUserCompetenciesDetails: (userId: string) => `${CONSTANTS.KONG_API_BASE}/${workallocationV2Path}/user/competencies/${userId}`,
    getUsersEndPoint: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/workallocation/getUsers`,
    getWorkAllocationById: (path: string, id: string) => `${CONSTANTS.KONG_API_BASE}/${path}/getWorkAllocationById/${id}`,
    getWorkOrderById: (path: string, id: string) => `${CONSTANTS.KONG_API_BASE}/${path}/getWorkOrderById/${id}`,
    getWorkOrders: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/getWorkOrders`,
    updateAllocationEndPoint: `${CONSTANTS.SB_EXT_API_BASE_2}/v1/workallocation/update`,
    updateWorkAllocationEndPoint: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/update`,
    updateWorkOrder: (path: string) => `${CONSTANTS.KONG_API_BASE}/${path}/update/workorder`,
    userAutoCompleteEndPoint: (searchTerm: string) =>
    `${CONSTANTS.KONG_API_BASE}/v1/workallocation/users/autocomplete?searchTerm=${searchTerm}`,
}

export const workAllocationApi = Router()

const failedToProcess = 'Failed to process the request. '
const userIdFailedMessage = 'NO_USER_ID'
const workAllocationIdFailedMessage = 'NO_WORK_ALLOCATION_ID'
const workOrderIdFailedMessage = 'NO_WORKORDER_ID'

type HeaderBuilder = (req: Request, userId: string) => object

const tokenHeaders = (req: Request) => ({
    Authorization: CONSTANTS.SB_API_KEY,
    'x-authenticated-user-token': extractUserToken(req),
})

const tokenUserHeaders: HeaderBuilder = (req, userId) => ({
    Authorization: CONSTANTS.SB_API_KEY,
    userId,
    'x-authenticated-user-token': extractUserToken(req),
})

const bearerUserHeaders: HeaderBuilder = (req, userId) => ({
    Authorization: extractAuthorizationFromRequest(req),
    userId,
})

const pdfRequestConfig: AxiosRequestConfig = {
    headers: { Accept: 'application/pdf' },
    responseType: 'arraybuffer',
}

// Relays the upstream response; a call that has already answered (validation failure) resolves to undefined
const forwardToUpstream = (call: (req: Request, res: Response) => Promise<AxiosResponse | undefined>) =>
    async (req: Request, res: Response) => {
        try {
            const response = await call(req, res)
            if (response) {
                res.status(response.status).send(response.data)
            }
        } catch (err) {
            logError(failedToProcess + err)
            sendUpstreamError(res, err, { error: ERROR.GENERAL_ERR_MSG })
        }
    }

// POSTs the request body on behalf of the calling user, rejecting requests without a userId
const postWithUserId = (endPoint: string, buildHeaders: HeaderBuilder) =>
    forwardToUpstream(async (req, res) => {
        const userId = extractUserId(req)
        if (!userId) {
            res.status(400).send(userIdFailedMessage)
            return undefined
        }
        return axios.post(endPoint, req.body, { ...axiosRequestConfig, headers: buildHeaders(req, userId) })
    })

// GETs a resource identified by a required route param
const getByParam = (
    param: string,
    missingMessage: string,
    endPoint: (value: string) => string,
    extraConfig: AxiosRequestConfig = {}
) =>
    forwardToUpstream(async (req, res) => {
        const value = req.params[param]
        if (!value) {
            res.status(400).send(missingMessage)
            return undefined
        }
        return axios.get(endPoint(value), {
            ...axiosRequestConfig,
            ...extraConfig,
            headers: { ...extraConfig.headers, ...tokenHeaders(req) },
        })
    })

workAllocationApi.post('/add', postWithUserId(
    API_END_POINTS.addAllocationEndPoint(workallocationV1Path), bearerUserHeaders
))

workAllocationApi.post('/update', postWithUserId(API_END_POINTS.updateAllocationEndPoint, bearerUserHeaders))

workAllocationApi.post('/userSearch', forwardToUpstream((req) =>
    axios.post(API_END_POINTS.getUsersEndPoint, req.body, { ...axiosRequestConfig, headers: {} })
))

workAllocationApi.get('/user/autocomplete/:searchTerm', forwardToUpstream((req) =>
    axios.get(API_END_POINTS.userAutoCompleteEndPoint(req.params.searchTerm), {
        ...axiosRequestConfig,
        headers: tokenHeaders(req),
    })
))

// ------------------ Work allocation v2 API'S ----------------------

workAllocationApi.post('/v2/add', postWithUserId(
    API_END_POINTS.addAllocationEndPoint(workallocationV2Path), tokenUserHeaders
))

workAllocationApi.post('/v2/update', postWithUserId(
    API_END_POINTS.updateWorkAllocationEndPoint(workallocationV2Path), tokenUserHeaders
))

workAllocationApi.post('/add/workorder', postWithUserId(
    API_END_POINTS.addWorkOrderEndPoint(workallocationV2Path), tokenUserHeaders
))

workAllocationApi.post('/update/workorder', postWithUserId(
    API_END_POINTS.updateWorkOrder(workallocationV2Path), tokenUserHeaders
))

workAllocationApi.post('/getWorkOrders', forwardToUpstream((req) =>
    axios.post(API_END_POINTS.getWorkOrders(workallocationV2Path), req.body, {
        ...axiosRequestConfig,
        headers: tokenHeaders(req),
    })
))

workAllocationApi.get('/getWorkOrderById/:workOrderId', getByParam(
    'workOrderId', workOrderIdFailedMessage, (id) => API_END_POINTS.getWorkOrderById(workallocationV2Path, id)
))

workAllocationApi.get('/getWorkAllocationById/:workAllocationId', getByParam(
    'workAllocationId', workAllocationIdFailedMessage,
    (id) => API_END_POINTS.getWorkAllocationById(workallocationV2Path, id)
))

workAllocationApi.post('/copy/workOrder', postWithUserId(
    API_END_POINTS.copyWorkOrderEndPoint(workallocationV2Path), tokenUserHeaders
))

workAllocationApi.get('/getUserBasicInfo/:userId', getByParam(
    'userId', userIdFailedMessage, API_END_POINTS.getUserBasicDetails
))

workAllocationApi.get('/getWOPdf/:workOrderId', getByParam(
    'workOrderId', workOrderIdFailedMessage, API_END_POINTS.getPdf, pdfRequestConfig
))

workAllocationApi.get('/getUserCompetencies/:userId', getByParam(
    'userId', userIdFailedMessage, API_END_POINTS.getUserCompetenciesDetails
))
