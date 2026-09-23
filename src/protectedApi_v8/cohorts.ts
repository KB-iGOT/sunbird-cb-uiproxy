import axios, { AxiosError, AxiosResponse } from 'axios'
import { Request, Response, Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import {
  fetchBatchUsers,
  getUsers,
  ICohortsUser,
  IUserProfile,
  sbRequestConfig,
} from '../proxies_v8/proxyHelpers'
import { CONSTANTS } from '../utils/env'
import { sendUpstreamError } from '../utils/errors'
import { logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractAuthorizationFromRequest, extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'

const API_END_POINTS = {
  addTemplate: `${CONSTANTS.HTTPS_HOST}/api/course/batch/cert/v1/template/add`,
  autoenrollment: `${CONSTANTS.KONG_API_BASE}/v1/autoenrollment`,
  batchParticipantsApi: `${CONSTANTS.KONG_API_BASE}/course/v1/batch/participants/list`,
  cohorts: `${CONSTANTS.KONG_API_BASE}/v2/resources`,
  downloadCert: (certId: string) => `${CONSTANTS.HTTPS_HOST}/api/certreg/v2/certs/download/${certId}`,
  groupCohorts: (groupId: number) =>
    `${CONSTANTS.USER_PROFILE_API_BASE}/groups/${groupId}/users `,
  hierarchyApiEndPoint: (contentId: string) =>
    `${CONSTANTS.KNOWLEDGE_MW_API_BASE}/action/content/v3/hierarchy/${contentId}?hierarchyType=detail`,
  issueCert: `${CONSTANTS.KONG_API_BASE}/course/batch/cert/v1/issue?reIssue=true`,
  searchUserRegistry: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/search/profile`,
}
const VALID_COHORT_TYPES = new Set([
  'activeusers',
  'commongoals',
  'authors',
  'educators',
  'top-performers',
])

const unknownError = 'Failed due to unknown reason'

export const cohortsApi = Router()

// Root org id stored in the session at login, or '' when unavailable
function sessionRootOrgId(req: Request): string {
  // tslint:disable-next-line
  if (typeof req.session != "undefined" && typeof req.session.rootOrgId != "undefined") {
    // tslint:disable-next-line
    return req.session.rootOrgId
  }
  return ''
}

// Headers for the cohorts/autoenrollment services: `scope` identifies the resource (e.g. resourceId or courseId)
function userOrgHeaders(req: Request, scope: { [key: string]: string }, rootOrg: unknown, userUUID: string) {
  return {
    Authorization: CONSTANTS.SB_API_KEY,
    ...scope,
    rootOrg,
    userUUID,
    'x-authenticated-user-orgid': sessionRootOrgId(req),
    // tslint:disable-next-line: no-duplicate-string
    'x-authenticated-user-token': extractUserToken(req),
  }
}

// Sends the upstream response back as-is, or forwards the upstream error (500 + unknownError when there is none)
async function forwardResponse(res: Response, request: () => Promise<AxiosResponse>) {
  try {
    const response = await request()
    res.status(response.status).send(response.data)
  } catch (errAny) {
    const err = errAny as AxiosError
    logError(String(err))
    sendUpstreamError(res, err, { error: unknownError })
  }
}

cohortsApi.get('/:cohortType/:contentId', async (req, res) => {
  try {
    const cohortType = req.params.cohortType
    const contentId = req.params.contentId
    if (!VALID_COHORT_TYPES.has(cohortType)) {
      res.status(400).send('INVALID_COHORT_TYPE')
      return
    }
    const org = req.header('org')
    const rootOrgValue = req.header('rootOrg')
    if (!org || !rootOrgValue) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    if (cohortType === 'authors') {
      const host = req.protocol + '://' + req.get('host')
      const userList = await getAuthorsDetails(host, extractAuthorizationFromRequest(req), contentId)
      res.status(200).send(userList)
    } else {
      const url = `${API_END_POINTS.cohorts}/user/cohorts/${cohortType}`
      const response = await axios({
        ...axiosRequestConfig,
        headers: userOrgHeaders(req, { resourceId: contentId }, rootOrgValue, extractUserIdFromRequest(req)),
        method: 'GET',
        url,
      })
      res.status(response.status).send(response.data)
    }
  } catch (errAny) {
    const err = errAny as AxiosError
    sendUpstreamError(res, err, { error: unknownError })
  }
})

cohortsApi.get('/:groupId', async (req, res) => {
  const { groupId } = req.params
  try {
    const org = req.header('org')
    const rootOrg = req.header('rootOrg')
    if (!org || !rootOrg) {
      res.status(400).send(ERROR.ERROR_NO_ORG_DATA)
      return
    }
    const response = await axios.get(API_END_POINTS.groupCohorts(Number(groupId)))
    res.status(response.status).send(response.data)
  } catch (errAny) {
    const err = errAny as AxiosError
    sendUpstreamError(res, err, { error: unknownError })
  }
})

export async function getAuthorsDetails(host: string, auth: string, contentId: string) {
  try {

    const url = host + `/apis/proxies/v8/action/content/v3/hierarchy/${contentId}?hierarchyType=detail`
    const hierarchyResponse = await axios.get(url, {
      ...axiosRequestConfig,
      headers: {
        Authorization: auth,
      },
    })
    const ids: string[] = []
    if (hierarchyResponse.data && hierarchyResponse.data.result &&
      hierarchyResponse.data.result.content) {
      const creatorDetails: string = hierarchyResponse.data.result.content.creatorDetails
      const authors = creatorDetails.substring(1, creatorDetails.length - 1).split(', ')
      authors.forEach((value) => {
        ids.push(JSON.parse(value).id)
      })
    }
    const userlist: ICohortsUser[] = []
    if (ids) {
      const searchBody = {
        filters: {
          'id.keyword': {
            or: ids,
          },
        },
      }
      const response = await axios.post(API_END_POINTS.searchUserRegistry, { ...searchBody }, {
        ...axiosRequestConfig,
      })
      const userProfileResult = response.data.result.UserProfile
      if ((typeof userProfileResult !== 'undefined' && userProfileResult.length > 0)) {
        userProfileResult.forEach((element: IUserProfile) => {
          userlist.push(getUsers(element))
        })
      }
    }
    return userlist
  } catch (errorAny) {
    const error = errorAny as AxiosError
    logError('ERROR WHILE FETCHING THE AUTHORS DETAILS --> ', String(error))
    return false
  }
}

cohortsApi.get('/user/autoenrollment/:courseId', (req, res) =>
  forwardResponse(res, () => axios.get(API_END_POINTS.autoenrollment, {
    ...axiosRequestConfig,
    headers: userOrgHeaders(req, { courseId: req.params.courseId }, req.headers.rootorg, req.headers.wid as string),
    params: req.query,
  }))
)

cohortsApi.patch('/course/batch/cert/template/add', (req, res) =>
  forwardResponse(res, () => axios.patch(API_END_POINTS.addTemplate, req.body, sbRequestConfig(req)))
)

cohortsApi.post('/course/batch/cert/issue', (req, res) =>
  forwardResponse(res, () => axios.post(API_END_POINTS.issueCert, req.body, sbRequestConfig(req)))
)

cohortsApi.get('/course/batch/cert/download/:certId', (req, res) =>
  forwardResponse(res, () => axios.get(API_END_POINTS.downloadCert(req.params.certId), sbRequestConfig(req)))
)

cohortsApi.get('/course/getUsersForBatch/:batchId/:deptName?', async (req, res) => {
  try {
    const reqBody = {
      request: {
        batch: {
          active: true,
          batchId: req.params.batchId,
        },
      },
    }
    const { response, userlist } = await fetchBatchUsers(req, API_END_POINTS.batchParticipantsApi, reqBody, req.params.deptName)
    res.status(response.status).send(userlist)
  } catch (errAny) {
    const err = errAny as AxiosError
    logError(String(err))

    sendUpstreamError(res, err, { error: unknownError })
  }
})

export {
  ICohortsUser,
  IEmploymentDetails,
  IPersonalDetails,
  IProfessionalDetailsEntity,
  IUserProfile,
  IUserProfileDetails,
} from '../proxies_v8/proxyHelpers'
