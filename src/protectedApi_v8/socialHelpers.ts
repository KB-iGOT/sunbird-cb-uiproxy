import axios from 'axios'
import { Request, Response, Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { AxiosRequestConfig } from '../models/axios-request-config.model'
import { CONSTANTS } from '../utils/env'
import { sendUpstreamError } from '../utils/errors'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserIdFromRequest } from '../utils/requestExtract'

// Shared by the social (v1) and socialv2 routers: org-scoped routes that forward to the node social service

export const GENERAL_ERROR_MSG = 'Failed due to unknown reason'
export const INVALID_ORG_MSG = ERROR.ERROR_NO_ORG_DATA

export const SOCIAL_API_END_POINTS = {
  acceptAnswer: `${CONSTANTS.NODE_API_BASE}/useractivity/acceptAnswer`,
  activityUpdate: `${CONSTANTS.NODE_API_BASE}/useractivity/create`,
  activityUsers: `${CONSTANTS.NODE_API_BASE}/post/users`,
  authoringCatalog: `${CONSTANTS.NODE_API_BASE}/catalog/fetch`,
  autocomplete: `${CONSTANTS.NODE_API_BASE}/post/autocomplete`,
  deletePost: `${CONSTANTS.NODE_API_BASE}/authtool/deletepost`,
  draftPost: `${CONSTANTS.NODE_API_BASE}/authtool/draftpost`,
  editMeta: `${CONSTANTS.NODE_API_BASE}/authtool/editmeta`,
  editTags: `${CONSTANTS.NODE_API_BASE}/authtool/edittags`,
  publishPost: `${CONSTANTS.NODE_API_BASE}/authtool/publishpost`,
  searchSocial: `${CONSTANTS.NODE_API_BASE}/search/searchv1`,
  timeline: `${CONSTANTS.NODE_API_BASE}/post/timeline`,
  timelineV2: `${CONSTANTS.NODE_API_BASE}/post/timelinev2`,
  viewConversation: `${CONSTANTS.NODE_API_BASE}/post/viewConversation`,
  viewConversationV2: `${CONSTANTS.NODE_API_BASE}/post/viewConversationv2`,
}

export const socialTimeoutConfig: AxiosRequestConfig = {
  ...axiosRequestConfig,
  timeout: Number(CONSTANTS.SOCIAL_TIMEOUT),
}

export interface IOrgHeaders {
  org: string
  rootOrg: string
}

// Reads the org/rootOrg headers; replies 400 and returns null when either is missing
export function requireOrgHeaders(req: Request, res: Response): IOrgHeaders | null {
  const org = req.header('org')
  const rootOrg = req.header('rootOrg')
  if (!org || !rootOrg) {
    res.status(400).send(INVALID_ORG_MSG)
    return null
  }
  return { org, rootOrg }
}

// tslint:disable-next-line: no-any
export type SocialBodyBuilder = (req: Request, orgHeaders: IOrgHeaders) => any

// { ...body, org, rootOrg }
export const withOrg: SocialBodyBuilder = (req, orgHeaders) => ({ ...req.body, ...orgHeaders })

// Adds the requesting user's id under `key`, either before ({ ...body, key, org, rootOrg })
// or after ({ ...body, org, rootOrg, key }) the org fields
export function withUser(
  key: string,
  position: 'before' | 'after' = 'after',
  getUserId: (req: Request) => unknown = extractUserIdFromRequest
): SocialBodyBuilder {
  return (req, orgHeaders) => {
    const user = { [key]: getUserId(req) }
    return position === 'before'
      ? { ...req.body, ...user, ...orgHeaders }
      : { ...req.body, ...orgHeaders, ...user }
  }
}

export interface ISocialRoute {
  path: string
  url: string
  // express route method (default 'post')
  method?: 'post' | 'put'
  // upstream method (default: same as `method`)
  upstreamMethod?: 'post' | 'put' | 'delete'
  body?: SocialBodyBuilder
  config?: (orgHeaders: IOrgHeaders) => AxiosRequestConfig
  errorLog?: string
}

function callUpstream(route: ISocialRoute, data: unknown, config: AxiosRequestConfig) {
  switch (route.upstreamMethod || route.method) {
    case 'put':
      return axios.put(route.url, data, config)
    case 'delete':
      return axios.delete(route.url, { ...config, data })
    default:
      return axios.post(route.url, data, config)
  }
}

// Handler: require org headers, build the upstream body, forward, relay the upstream status/body or error
export function socialForwardHandler(route: ISocialRoute) {
  const buildBody = route.body || withOrg
  return async (req: Request, res: Response) => {
    try {
      const orgHeaders = requireOrgHeaders(req, res)
      if (!orgHeaders) {
        return
      }
      const config = route.config ? route.config(orgHeaders) : axiosRequestConfig
      const response = await callUpstream(route, buildBody(req, orgHeaders), config)
      res.status(response.status).send(response.data)
    } catch (err) {
      if (route.errorLog) {
        logError(route.errorLog, err)
      }
      sendUpstreamError(res, err, { error: GENERAL_ERROR_MSG })
    }
  }
}

// Registers the routes on the router in the given order
export function registerSocialRoutes(router: Router, routes: ISocialRoute[]) {
  routes.forEach((route) => {
    router[route.method || 'post'](route.path, socialForwardHandler(route))
  })
}

// Routes common to social (v1) and socialv2; v1 overrides a few of them (see social.ts)
export const SHARED_SOCIAL_ROUTES: { [name: string]: ISocialRoute } = {
  acceptAnswer: { path: '/post/acceptAnswer', url: SOCIAL_API_END_POINTS.acceptAnswer },
  activityCreate: { path: '/post/activity/create', url: SOCIAL_API_END_POINTS.activityUpdate },
  activityUsers: { path: '/post/activity/users', url: SOCIAL_API_END_POINTS.activityUsers },
  autocomplete: { path: '/post/autocomplete', url: SOCIAL_API_END_POINTS.autocomplete },
  catalog: { path: '/catalog', url: SOCIAL_API_END_POINTS.authoringCatalog, body: withUser('userid') },
  deletePost: {
    errorLog: 'ERROR DELETING POST',
    path: '/post/delete',
    upstreamMethod: 'delete',
    url: SOCIAL_API_END_POINTS.deletePost,
  },
  draft: { path: '/post/draft', url: SOCIAL_API_END_POINTS.draftPost },
  editMeta: { errorLog: 'EDIT META ERROR >', method: 'put', path: '/edit/meta', url: SOCIAL_API_END_POINTS.editMeta },
  editTags: { method: 'put', path: '/edit/tags', url: SOCIAL_API_END_POINTS.editTags },
  publish: { path: '/post/publish', url: SOCIAL_API_END_POINTS.publishPost },
  search: { path: '/post/search', url: SOCIAL_API_END_POINTS.searchSocial },
  timeline: { path: '/post/timeline', url: SOCIAL_API_END_POINTS.timeline, config: () => socialTimeoutConfig },
  timelineV2: {
    body: withUser('userId'),
    config: () => socialTimeoutConfig,
    path: '/post/timelineV2',
    url: SOCIAL_API_END_POINTS.timelineV2,
  },
  viewConversation: { path: '/post/viewConversation', url: SOCIAL_API_END_POINTS.viewConversation },
  viewConversationV2: { path: '/post/viewConversationV2', url: SOCIAL_API_END_POINTS.viewConversationV2 },
}
