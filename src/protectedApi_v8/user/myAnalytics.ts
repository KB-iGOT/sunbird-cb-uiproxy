import axios from 'axios'
import { Request, Response, Router } from 'express'
import {
  IAchievementsResponse,
  IAcquiredSkills,
  IAdmin,
  IAllSkills,
  IAssessmentResponse,
  IAssessmentResponseV1,
  ICertificateResponse,
  ICompassRolesResponse,
  IExistingRoles,
  IMyAnalytics,
  INsoContentProgress,
  IRecommendedSkills,
  IRequiredSkills,
  IRoles,
  ISkillQuotient,
  ITimeSpentResponse,
} from '../../models/myAnalytics.model'
import { CONSTANTS } from '../../utils/env'
import { sendUpstreamError } from '../../utils/errors'
import { getStringifiedQueryParams } from '../../utils/helpers'
import { extractUserIdFromRequest } from '../../utils/requestExtract'

// To be passed to My Analytics APIs as the header 'validator_url'.
const MY_ANALYTICS_VALIDATOR_URL = `${CONSTANTS.HTTPS_HOST}/apis/protected/v8/user/validate`

const MY_ANALYTICS_API_BASE = `${CONSTANTS.HTTPS_HOST}LA1/api`

const GENERAL_ERROR_MSG = 'Failed due to unknown reason'

type UpstreamMethod = 'get' | 'post' | 'delete'

type QueryBuilder = (req: Request) => string

interface IAnalyticsProxyRoute<T> {
  // Route path on this router.
  path: string
  // Upstream path, relative to MY_ANALYTICS_API_BASE.
  upstream: string
  method?: 'get' | 'post'
  // Defaults to `method`.
  upstreamMethod?: UpstreamMethod
  // When set, its result is appended to the upstream URL after a '?'.
  query?: QueryBuilder
  // Defaults to extractUserIdFromRequest.
  userId?: (req: Request) => string
  // tslint:disable-next-line: no-any
  mapResponse?: (data: T) => any
}

export const myAnalyticsApi = Router()

// Builds the upstream query string from the given keys, in order, taking each
// value from the route params or, failing that, from the request query.
// Empty values are skipped.
function queryFrom(...keys: string[]): QueryBuilder {
  return (req: Request) => {
    const source = { ...req.query, ...req.params }
    // tslint:disable-next-line: no-any
    const params: { [key: string]: any } = {}
    keys.forEach((key) => {
      params[key] = source[key]
    })
    return getStringifiedQueryParams(params)
  }
}

const PROGRESS_QUERY = queryFrom('contentType', 'endDate', 'isCompleted', 'startDate')

function getAnalyticsHeaders(req: Request, userId: string) {
  return {
    Authorization: req.headers.authorization,
    org: req.header('org'),
    rootOrg: req.header('rootOrg'),
    validator_url: MY_ANALYTICS_VALIDATOR_URL,
    wid: userId,
  }
}

function callAnalyticsApi<T>(
  req: Request,
  method: UpstreamMethod,
  upstream: string,
  query?: QueryBuilder,
  userId: string = extractUserIdFromRequest(req)
) {
  const url = `${MY_ANALYTICS_API_BASE}/${upstream}` + (query ? `?${query(req)}` : '')
  const config = { headers: getAnalyticsHeaders(req, userId) }
  if (method === 'post') {
    return axios.post<T>(url, req.body, config)
  }
  return axios[method]<T>(url, config)
}

// Registers a route that forwards the request to the My Analytics API and
// sends back the upstream status and (optionally mapped) data.
// tslint:disable-next-line: no-any
function proxyAnalytics<T = any>(route: IAnalyticsProxyRoute<T>) {
  const method = route.method || 'get'
  myAnalyticsApi[method](route.path, async (req: Request, res: Response) => {
    try {
      const userId = route.userId ? route.userId(req) : extractUserIdFromRequest(req)
      const response = await callAnalyticsApi<T>(
        req,
        route.upstreamMethod || method,
        route.upstream,
        route.query,
        userId
      )
      res.status(response.status).send(route.mapResponse ? route.mapResponse(response.data) : response.data)
    } catch (err) {
      sendUpstreamError(res, err, { error: GENERAL_ERROR_MSG })
    }
  })
}

// Renames the upstream list under `listKey` to `achievements`.
function toAchievementsResponse(
  receivedData: IAssessmentResponseV1 & ICertificateResponse,
  listKey: 'assessments' | 'certifications'
): IAchievementsResponse {
  const result: IAchievementsResponse = {
    ...receivedData,
    achievements: receivedData[listKey] || [],
  }
  delete result[listKey]
  return result
}

myAnalyticsApi.get(
  '/userProgress/:contentType',
  getMyAnalytics,
  async (_req: Request, res: Response) => {
    try {
      return res.send(res.locals.myAnalyticsData)
    } catch (err) {
      return sendUpstreamError(res, err, { error: GENERAL_ERROR_MSG })
    }
  }
)

myAnalyticsApi.get(
  '/:contentType/learning-history',
  getMyAnalytics,
  getMyAnalyticsLearningHistory,
  async (_req: Request, res: Response) => {
    try {
      res.send({
        learningHistory: res.locals.myAnalyticsLearningHistory,
        learningHistoryProgress: res.locals.myAnalyticsLearningHistoryProgressRange,
      })
    } catch (err) {
      sendUpstreamError(res, err, { error: GENERAL_ERROR_MSG })
    }
  }
)

proxyAnalytics<IAssessmentResponseV1>({
  mapResponse: (data) => toAchievementsResponse(data, 'assessments'),
  path: '/assessments',
  query: queryFrom('endDate', 'startDate'),
  upstream: 'v1/assessment',
})

proxyAnalytics<ICertificateResponse>({
  mapResponse: (data) => toAchievementsResponse(data, 'certifications'),
  path: '/certification',
  query: queryFrom('endDate', 'startDate'),
  upstream: 'v1/certification',
})

// LA1/api/v1/assessment?startDate=2018-04-01&endDate=2020-03-31
proxyAnalytics<IAssessmentResponse>({ path: '/assessment/:contentType', query: PROGRESS_QUERY, upstream: 'assessment' })

proxyAnalytics<ITimeSpentResponse>({ path: '/timespent/:contentType', query: PROGRESS_QUERY, upstream: 'timespent' })

proxyAnalytics<INsoContentProgress>({
  path: '/nsoArtifactsAndCollaborators/:contentType',
  query: PROGRESS_QUERY,
  upstream: 'nsoArtifactsAndCollaborators',
})

proxyAnalytics<IRequiredSkills[]>({ path: '/skills', upstream: 'skills' })

proxyAnalytics<IAcquiredSkills[]>({
  path: '/myskills',
  upstream: 'myskills',
  userId: (req) => (req.query.wid as string) || extractUserIdFromRequest(req),
})

proxyAnalytics<IRecommendedSkills[]>({ path: '/recommendedSkills', upstream: 'recommendedSkills' })

proxyAnalytics<IAllSkills[]>({
  path: '/allSkills',
  query: queryFrom('category', 'horizon', 'pageNo', 'searchText'),
  upstream: 'allSkills',
})

proxyAnalytics<IAdmin>({ path: '/isAdmin', upstream: 'isAdmin' })

proxyAnalytics<IRoles[]>({ path: '/role/get', upstream: 'role/get' })

proxyAnalytics<ISkillQuotient>({ path: '/skillquotient', query: queryFrom('skill_id'), upstream: 'skillquotient' })

proxyAnalytics<ISkillQuotient>({ path: '/rolequotient', query: queryFrom('role_id'), upstream: 'rolequotient' })

proxyAnalytics<ICompassRolesResponse>({
  path: '/skills-role/:roleId',
  query: (req) => `role_id=${req.params.roleId}`,
  upstream: 'nso/getCourseAndProgress',
})

proxyAnalytics<IExistingRoles[]>({ path: '/role/getExisting', upstream: 'role/getExisting' })

proxyAnalytics({ method: 'post', path: '/role/add', upstream: 'role/add' })

proxyAnalytics({ method: 'post', path: '/skills/add', upstream: 'skills/add' })

proxyAnalytics({ method: 'post', path: '/role/shareRole', upstream: 'role/shareRole' })

proxyAnalytics({ path: '/skill/search', query: queryFrom('search_text'), upstream: 'skill/search' })

proxyAnalytics({
  path: '/role/delete',
  query: queryFrom('role_id'),
  upstream: 'role/delete',
  upstreamMethod: 'delete',
})

proxyAnalytics({ method: 'post', path: '/role/update', upstream: 'role/update' })

proxyAnalytics({ path: '/isApprover', upstream: 'isApprover' })

proxyAnalytics({ path: '/skillData', query: queryFrom('skill_id'), upstream: 'skillData' })

proxyAnalytics({ path: '/search', query: queryFrom('search_text', 'type'), upstream: 'search' })

proxyAnalytics({
  path: '/projectEndorsement/getList',
  query: queryFrom('request_type'),
  upstream: 'projectEndorsement/getList',
})

proxyAnalytics({ path: '/projectEndorsement/get', upstream: 'projectEndorsement/get' })

proxyAnalytics({
  method: 'post',
  path: '/projectEndorsement/endorseRequest',
  query: queryFrom('endorse_id'),
  upstream: 'projectEndorsement/endorseRequest',
})

proxyAnalytics({ method: 'post', path: '/projectEndorsement/add', upstream: 'projectEndorsement/add' })

// WRITE MIDDLEWARE BELOW

export async function getMyAnalytics(req: Request, res: Response, next: Function) {
  try {
    const response = await callAnalyticsApi<IMyAnalytics>(req, 'get', 'userprogress', PROGRESS_QUERY)
    res.locals.myAnalyticsData = response.data

    next()
  } catch (err) {
    sendUpstreamError(res, err, { error: GENERAL_ERROR_MSG })
  }
}

export async function getMyAnalyticsLearningHistory(_req: Request, res: Response, next: Function) {
  try {
    const myAnalyticsData: IMyAnalytics = res.locals.myAnalyticsData

    res.locals.myAnalyticsLearningHistory = myAnalyticsData.learning_history
    res.locals.myAnalyticsLearningHistoryProgressRange =
      myAnalyticsData.learning_history_progress_range

    next()
  } catch (err) {
    sendUpstreamError(res, err, { error: GENERAL_ERROR_MSG })
  }
}
