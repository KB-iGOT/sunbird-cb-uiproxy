import axios from 'axios'
import { Request, RequestHandler, Response, Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { sendUpstreamError } from '../utils/errors'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'

// Shared plumbing for the connections / connections_v2 / network routers

export const connectionEndpoints = {
  add: `${CONSTANTS.KONG_API_BASE}/connections/add`,
  established: `${CONSTANTS.KONG_API_BASE}/connections/profile/fetch/established`,
  recommended: `${CONSTANTS.KONG_API_BASE}/connections/profile/find/recommended`,
  requested: `${CONSTANTS.KONG_API_BASE}/connections/profile/fetch/requested`,
  requestsReceived: `${CONSTANTS.KONG_API_BASE}/connections/profile/fetch/requests/received`,
  suggests: `${CONSTANTS.KONG_API_BASE}/connections/profile/find/suggests`,
  update: `${CONSTANTS.KONG_API_BASE}/connections/update`,
}

export type UserIdExtractor = (req: Request) => string

export interface IConnectionContext {
  req: Request
  res: Response
  rootOrg: string
  userId: string
}

export interface IConnectionRoute {
  method: 'get' | 'post'
  path: string
  logLabel: string
  // defaults to extractUserIdFromRequest
  getUserId?: UserIdExtractor
  // body fields that must all be truthy, otherwise 400 like a missing userId
  requiredBodyFields?: string[]
  handle: (ctx: IConnectionContext) => Promise<void>
}

export const orgHeaders = ({ req, rootOrg }: IConnectionContext) => ({
  Authorization: CONSTANTS.SB_API_KEY,
  rootOrg,
  // tslint:disable-next-line: all
  'x-authenticated-user-token': extractUserToken(req),
})

export const userHeaders = ({ req, rootOrg, userId }: IConnectionContext) => ({
  Authorization: CONSTANTS.SB_API_KEY,
  rootOrg,
  userId,
  // tslint:disable-next-line: all
  'x-authenticated-user-token': extractUserToken(req),
})

type HeaderBuilder = (ctx: IConnectionContext) => object

// Returns a handler that GETs the url with the user headers and sends back the upstream data
export const forwardGet = (url: string) => async (ctx: IConnectionContext) => {
  const response = await axios.get(url, { ...axiosRequestConfig, headers: userHeaders(ctx) })
  ctx.res.send(response.data)
}

// Returns a handler that POSTs the built body to the url and sends back the upstream data
export const forwardPost = (
  url: string,
  buildBody: (ctx: IConnectionContext) => unknown,
  buildHeaders: HeaderBuilder = userHeaders
) => async (ctx: IConnectionContext) => {
  const response = await axios.post(url, buildBody(ctx), { ...axiosRequestConfig, headers: buildHeaders(ctx) })
  ctx.res.send(response.data)
}

// Request body for the recommendation api, searching users of the given department(s)
export const departmentSearch = (values: unknown) => ({
  offset: 0,
  search: [
    {
      field: 'employmentDetails.departmentName',
      values,
    },
  ],
  size: 5,
})

// The GET routes that are identical across the connection routers
export const connectionFetchRoutes = (
  prefix = '',
  suggestsUserId: UserIdExtractor = extractUserIdFromRequest
): IConnectionRoute[] => [
  {
    handle: forwardGet(connectionEndpoints.requested),
    logLabel: 'CONNECTIONS REQUESTS ERROR> ',
    method: 'get',
    path: `${prefix}/connections/requested`,
  },
  {
    handle: forwardGet(connectionEndpoints.requestsReceived),
    logLabel: 'CONNECTIONS REQUESTS ERROR> ',
    method: 'get',
    path: `${prefix}/connections/requests/received`,
  },
  {
    handle: forwardGet(connectionEndpoints.established),
    logLabel: 'CONNECTIONS ERROR',
    method: 'get',
    path: `${prefix}/connections/established`,
  },
  {
    getUserId: (req) => req.params.id,
    handle: forwardGet(connectionEndpoints.established),
    logLabel: 'CONNECTIONS ERROR',
    method: 'get',
    path: `${prefix}/connections/established/:id`,
  },
  {
    getUserId: suggestsUserId,
    handle: forwardGet(connectionEndpoints.suggests),
    logLabel: 'SUGGESTS ERROR >',
    method: 'get',
    path: `${prefix}/connections/suggests`,
  },
]

const profileFields = ['userDepartmentFrom', 'userIdTo', 'userNameFrom', 'userDepartmentTo', 'userNameTo']

const profileConnectionBody = ({ req, userId }: IConnectionContext) => ({
  userDepartmentFrom: req.body.userDepartmentFrom,
  userIdFrom: userId,
  userNameFrom: req.body.userNameFrom,

  userDepartmentTo: req.body.userDepartmentTo,
  userIdTo: req.body.userIdTo,
  userNameTo: req.body.userNameTo,
})

// Add / update routes that carry both users' name and department (connections and connections_v2)
export const profileConnectionChangeRoutes = (prefix = ''): IConnectionRoute[] => [
  {
    handle: forwardPost(connectionEndpoints.add, profileConnectionBody, orgHeaders),
    logLabel: 'ADD CONNECTION ERROR > ',
    method: 'post',
    path: `${prefix}/add/connection`,
    requiredBodyFields: profileFields,
  },
  {
    handle: forwardPost(
      connectionEndpoints.update,
      (ctx) => ({ status: ctx.req.body.status, ...profileConnectionBody(ctx) }),
      orgHeaders
    ),
    logLabel: 'UPDATE CONNECTION ERROR > ',
    method: 'post',
    path: `${prefix}/update/connection`,
    requiredBodyFields: [...profileFields, 'status'],
  },
]

export const recommendedLogLabel = 'RECOMMENDED ERROR > '

// POST route passing the request body straight through to the recommendation api
export const recommendedRoute = (
  path: string,
  url: string,
  getUserId: UserIdExtractor,
  buildHeaders: HeaderBuilder = userHeaders
): IConnectionRoute => ({
  getUserId,
  handle: forwardPost(url, (ctx) => ctx.req.body, buildHeaders),
  logLabel: recommendedLogLabel,
  method: 'post',
  path,
})

// Validates rootOrg and userId (plus any required body fields) before running the route's handler;
// any thrown/upstream error is logged and forwarded, falling back to 500 { error: fallbackMessage }
const connectionHandler = (fallbackMessage: string, route: IConnectionRoute): RequestHandler => {
  const getUserId = route.getUserId || extractUserIdFromRequest
  const requiredBodyFields = route.requiredBodyFields || []
  return async (req, res) => {
    try {
      const rootOrg = req.header('rootorg')
      const userId = getUserId(req)
      const missingBodyField = requiredBodyFields.some((field) => !req.body[field])

      if (!rootOrg) {
        res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
        return
      }
      if (!userId || missingBodyField) {
        res.status(400).send(ERROR.GENERAL_ERR_MSG)
        return
      }
      await route.handle({ req, res, rootOrg, userId })
    } catch (err) {
      logError(route.logLabel, err)
      sendUpstreamError(res, err, { error: fallbackMessage })
    }
  }
}

export const registerConnectionRoutes = (router: Router, fallbackMessage: string, routes: IConnectionRoute[]) => {
  routes.forEach((route) => {
    router[route.method](route.path, connectionHandler(fallbackMessage, route))
  })
}
