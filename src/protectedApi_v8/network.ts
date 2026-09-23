import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logDebug } from '../utils/logger'
import { extractUserIdFromRequest } from '../utils/requestExtract'
import {
  connectionFetchRoutes,
  departmentSearch,
  forwardPost,
  IConnectionContext,
  orgHeaders,
  recommendedLogLabel,
  recommendedRoute,
  registerConnectionRoutes
} from './connectionsHelpers'

const unknown = 'Network Apis:- Failed due to unknown reason'
const apiEndpoints = {
  detail: `${CONSTANTS.USER_PROFILE_API_BASE}/user/multi-fetch/wid`,
  postConnectionAddData: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/connections/add`,
  postConnectionRecommendationData: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/connections/profile/find/recommended`,
  postConnectionUpdateData: `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/connections/update`,
}

// The network hub recommendation api is called without the api key / user token
const networkHubHeaders = ({ rootOrg, userId }: IConnectionContext) => ({
  rootOrg,
  userId,
})

// Recommends connections from the user's department (from the profile multi-fetch), defaulting to 'igot'
async function recommendByUserDepartment(ctx: IConnectionContext) {
  const { rootOrg, userId } = ctx
  const responseDetails = await axios.post(
    apiEndpoints.detail,
    {
      conditions: {
        root_org: rootOrg,
      },
      source_fields: ['wid', 'email', 'first_name', 'last_name', 'department_name'],
      values: [userId],
    },
    {
      ...axiosRequestConfig,
      headers: { rootOrg },
    }
  )
  logDebug('responseDetails from /detailsv1 : ', responseDetails.data)
  let userDepartment = ''
  if (responseDetails && responseDetails.data && responseDetails.data.length) {
    userDepartment = responseDetails.data[0].department_name
  }
  const usrDept = userDepartment || 'igot'

  await forwardPost(apiEndpoints.postConnectionRecommendationData, () => departmentSearch([usrDept]), networkHubHeaders)(ctx)
}

export const networkConnectionApi = Router()

registerConnectionRoutes(networkConnectionApi, unknown, [
  ...connectionFetchRoutes(),
  {
    handle: forwardPost(
      apiEndpoints.postConnectionAddData,
      ({ req, userId }) => ({
        connectionId: req.body.connectionId,
        userId,
      }),
      orgHeaders
    ),
    logLabel: 'ADD CONNECTION ERROR > ',
    method: 'post',
    path: '/add/connection',
    requiredBodyFields: ['connectionId'],
  },
  {
    // the ids are intentionally swapped when forwarding an update
    handle: forwardPost(
      apiEndpoints.postConnectionUpdateData,
      ({ req, userId }) => ({
        connectionId: userId,
        status: req.body.status,
        userId: req.body.connectionId,
      }),
      orgHeaders
    ),
    logLabel: 'UPDATE CONNECTION ERROR > ',
    method: 'post',
    path: '/update/connection',
    requiredBodyFields: ['connectionId', 'status'],
  },
  recommendedRoute(
    '/connections/recommended',
    apiEndpoints.postConnectionRecommendationData,
    extractUserIdFromRequest,
    networkHubHeaders
  ),
  {
    handle: recommendByUserDepartment,
    logLabel: recommendedLogLabel,
    method: 'post',
    path: '/connections/recommended/userDepartment',
  },
])
