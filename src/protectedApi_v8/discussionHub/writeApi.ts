import axios, { AxiosResponse } from 'axios'
import { Request, Response, Router } from 'express'
import { getUserUIDBySession, getWriteApiAdminUID} from '../../utils/discussionHub-helper'
import { CONSTANTS } from '../../utils/env'
import { logDebug, logError } from '../../utils/logger'
import { discussionHubHandler, discussionHubRequestConfig, logRequestContext } from './discussionHubRequest'

const API_ENDPOINTS = {
    createTopic: `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/v2/topics`,
    createUser: `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/v2/users`,
    // tslint:disable-next-line: object-literal-sort-keys
    createOrUpdateTags: (topicId: string | number) =>
        `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/v2/topics/${topicId}/tags`,
    followTopic: (topicId: string | number) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/v2/topics/${topicId}/follow`,
    replyToTopic: (topicId: string | number) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/v2/topics/${topicId}`,
    votePost: (postId: string | number) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/v2/posts/${postId}/vote`,
    // tslint:disable-next-line: object-literal-sort-keys
    bookmarkPost: (postId: string | number) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/v2/posts/${postId}/bookmark`,
}

export const writeApi = Router()

// tslint:disable-next-line: no-any
export async function createDiscussionHubUser(req: any , user: any): Promise<any> {
    logDebug('Starting to create new user into NodeBB DiscussionHub...')
    const request1 = {
        ...user,
        _uid: getWriteApiAdminUID(),
    }
    const url = API_ENDPOINTS.createUser
    try {
        return await axios.post(url, request1, discussionHubRequestConfig(req))
    } catch (err) {
        logError('ERROR ON method createDiscussionHubUser api call to nodebb DiscussionHub>', err)
        throw err
    }
}

type BodyBuilder = (req: Request, userUid: unknown) => object

const bodyWithUid: BodyBuilder = (req, userUid) => ({ ...req.body, _uid: userUid })
const uidOnly: BodyBuilder = (_req, userUid) => ({ _uid: userUid })

// Only answers when NodeBB returned data (existing behaviour)
const sendIfData = (res: Response, response: AxiosResponse) => {
    if (response && response.data) {
        res.send(response.data)
    }
}

// POSTs/PUTs to NodeBB as the session user
const writeAsSessionUser = (
    method: 'post' | 'put',
    errorLabel: string,
    endPoint: (req: Request) => string,
    buildBody: BodyBuilder
) =>
    discussionHubHandler(errorLabel, async (req, res) => {
        logRequestContext(req)
        const url = endPoint(req)
        const userUid = await getUserUIDBySession(req)
        const response = await axios[method](url, buildBody(req, userUid), discussionHubRequestConfig(req))
        sendIfData(res, response)
    })

// DELETEs on NodeBB as the session user, passing the uid as a query param
const deleteAsSessionUser = (errorLabel: string, endPoint: (req: Request) => string) =>
    discussionHubHandler(errorLabel, async (req, res) => {
        logRequestContext(req)
        const userUid = await getUserUIDBySession(req)
        const url = endPoint(req) + `?_uid=${userUid}`
        const response = await axios.delete(url, discussionHubRequestConfig(req))
        sendIfData(res, response)
    })

const topicUrl = (endPoint: (topicId: string) => string) => (req: Request) => endPoint(req.params.topicId)
const postUrl = (endPoint: (postId: string) => string) => (req: Request) => endPoint(req.params.postId)

writeApi.post('/topics', writeAsSessionUser(
    'post', 'ERROR ON POST writeApi /topics >', () => API_ENDPOINTS.createTopic, bodyWithUid
))

writeApi.post('/topics/:topicId', writeAsSessionUser(
    'post', 'ERROR ON writeAPI  POST /topics/:topicId >', topicUrl(API_ENDPOINTS.replyToTopic), bodyWithUid
))

writeApi.post('/users', discussionHubHandler('ERROR ON writeAPI POST /users >', async (req, res) => {
    logRequestContext(req)
    const response = await createDiscussionHubUser(req, req.body)
    res.send(response.data)
}))

writeApi.post('/posts/:postId/bookmark', writeAsSessionUser(
    'post', 'ERROR ON writeAPI POST /posts/:postId/bookmark >', postUrl(API_ENDPOINTS.bookmarkPost), uidOnly
))

writeApi.delete('/posts/:postId/bookmark', deleteAsSessionUser(
    'ERROR ON writeAPI DELETE /posts/:postId/bookmark >', postUrl(API_ENDPOINTS.bookmarkPost)
))

writeApi.post('/posts/:postId/vote', writeAsSessionUser(
    'post', 'ERROR ON writeAPI POST /posts/:postId/vote >', postUrl(API_ENDPOINTS.votePost), bodyWithUid
))

writeApi.delete('/posts/:postId/vote', deleteAsSessionUser(
    'ERROR ON writeAPI Delete /posts/:postId/vote >', postUrl(API_ENDPOINTS.votePost)
))

writeApi.put('/topics/:topicId/follow', writeAsSessionUser(
    'put', 'ERROR ON writeAPI  PUT /topics/:topicId/follow >', topicUrl(API_ENDPOINTS.followTopic), uidOnly
))

// Tags are written without a session uid
writeApi.put('/topics/:topicId/tags', discussionHubHandler('ERROR ON writeAPI  PUT /topics/:topicId/tags >',
    async (req, res) => {
        logRequestContext(req)
        const url = API_ENDPOINTS.createOrUpdateTags(req.params.topicId)
        const response = await axios.put(url, { ...req.body }, discussionHubRequestConfig(req))
        sendIfData(res, response)
    }
))
