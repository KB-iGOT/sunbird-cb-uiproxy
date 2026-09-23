import axios from 'axios'
import { Request, Router } from 'express'
import { getUserSlug, getUserUIDBySession} from '../../utils/discussionHub-helper'
import { CONSTANTS } from '../../utils/env'
import { logDebug, logError } from '../../utils/logger'
import { discussionHubHandler, discussionHubRequestConfig, logRequestContext } from './discussionHubRequest'

const API_ENDPOINTS = {
    getUserBookmarks: (slug: string) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/user/${slug}/bookmarks`,
    getUserDownvotedPosts: (slug: string) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/user/${slug}/downvoted`,
    getUserGroups: (slug: string) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/user/${slug}/groups`,
    getUserInfo: (slug: string) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/user/${slug}/info`,
    getUserPosts: (slug: string) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/user/${slug}/posts`,
    getUserProfile: (slug: string) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/user/${slug}`,
    getUserUpvotedPosts: (slug: string) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/user/${slug}/upvoted`,
    getUsersWatchedTopics: (slug: string) => `${CONSTANTS.KONG_API_BASE}/nodebb/auth/api/user/${slug}/watched`,
    // tslint:disable-next-line: object-literal-sort-keys
    getUserByEmail: (email: string) => `${CONSTANTS.KONG_API_BASE}/nodebb/api/user/email/${email}`,
    getUserByUsername: (username: string) => `${CONSTANTS.KONG_API_BASE}/api/user/username/${username}`,
}

export const usersApi = Router()

const slugFromParams = (req: Request) => req.params.slug

// GETs a NodeBB user resource for the resolved slug, as the session user, forwarding rootOrg
const userResourceHandler = (
    errorLabel: string,
    endPoint: (slug: string) => string,
    resolveSlug: (req: Request, userId: string) => string | Promise<string> = slugFromParams
) =>
    discussionHubHandler(errorLabel, async (req, res) => {
        const { rootOrg, userId } = logRequestContext(req)
        const slug = await resolveSlug(req, userId)
        const userUid = await getUserUIDBySession(req)
        const url = endPoint(slug) + `?_uid=${userUid}`
        const response = await axios.get(url, discussionHubRequestConfig(req, { rootOrg }))
        res.send(response.data)
    })

const slugResourceHandler = (segment: string, endPoint: (slug: string) => string) =>
    userResourceHandler(`ERROR ON GET topicsApi /:slug/${segment} >`, endPoint)

usersApi.get('/:slug/bookmarks', slugResourceHandler('bookmarks', API_ENDPOINTS.getUserBookmarks))

usersApi.get('/:slug/downvoted', slugResourceHandler('downvoted', API_ENDPOINTS.getUserDownvotedPosts))

usersApi.get('/:slug/groups', slugResourceHandler('groups', API_ENDPOINTS.getUserGroups))

usersApi.get('/:slug/info', slugResourceHandler('info', API_ENDPOINTS.getUserInfo))

usersApi.get('/me', userResourceHandler('ERROR ON GET User Profile /me >', API_ENDPOINTS.getUserProfile, getUserSlug))

usersApi.get('/:slug/posts', slugResourceHandler('posts', API_ENDPOINTS.getUserPosts))

usersApi.get('/:slug/upvoted', slugResourceHandler('upvoted', API_ENDPOINTS.getUserUpvotedPosts))

usersApi.get('/:slug/watched', slugResourceHandler('watched', API_ENDPOINTS.getUsersWatchedTopics))

usersApi.get('/email/:email', discussionHubHandler('ERROR ON GET topicsApi /email/:email >', async (req, res) => {
    logRequestContext(req)
    const response = await getUserByEmail(req, req.params.email)
    res.send(response.data)
}))

usersApi.get('/:slug/about', discussionHubHandler('ERROR ON GET topicsApi /:slug/about >', async (req, res) => {
    logRequestContext(req)
    const slug = req.params.slug
    const userUid = await getUserUIDBySession(req)
    logDebug('called /:slug/about slug=> ', slug)
    const url = API_ENDPOINTS.getUserProfile(slug) + `?_uid=${userUid}`
    logDebug('called /:slug/about url=> ', url)
    const response = await axios.get(url, discussionHubRequestConfig(req))
    res.send(response.data)
}))

// tslint:disable-next-line: no-any
async function fetchDiscussionHubUser(req: any, url: string, methodName: string): Promise<any> {
    logDebug('Finding user in NodeBB DiscussionHub...')
    try {
        return await axios.get(url, discussionHubRequestConfig(req))
    } catch (err) {
        logError(`ERROR ON method ${methodName} api call to nodebb DiscussionHub >`, err)
        throw err
    }
}

// tslint:disable-next-line: no-any
export async function getUserByEmail(req: any , email: any): Promise<any> {
    return fetchDiscussionHubUser(req, API_ENDPOINTS.getUserByEmail(email), 'getUserByEmail')
}

// tslint:disable-next-line: no-any
export async function getUserByUsername(req: any , username: any): Promise<any> {
    const response = await fetchDiscussionHubUser(req, API_ENDPOINTS.getUserByUsername(username), 'getUserByUsername')
    return response && response.data
}
