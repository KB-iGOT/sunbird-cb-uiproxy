import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logDebug } from '../utils/logger'
import { extractUserIdFromRequest } from '../utils/requestExtract'
import {
  connectionEndpoints,
  connectionFetchRoutes,
  departmentSearch,
  forwardPost,
  IConnectionContext,
  profileConnectionChangeRoutes,
  recommendedLogLabel,
  recommendedRoute,
  registerConnectionRoutes
} from './connectionsHelpers'

const unknown = 'Connections Apis:- Failed due to unknown reason'
const getUserRegistryById = (userId: string) =>
  `${CONSTANTS.NETWORK_HUB_SERVICE_BACKEND}/v1/user/search/profile?userId=${userId}`

// Recommends connections from the user's department (as registered in the network hub), defaulting to 'igot'
async function recommendByUserDepartment(ctx: IConnectionContext) {
  const responseDetails = await axios.get(getUserRegistryById(ctx.userId), {
    ...axiosRequestConfig,
    headers: { rootOrg: ctx.rootOrg },
  })
  logDebug('responseDetails from /search/profile : ', responseDetails.data)
  let userDepartment = ''
  if (responseDetails && responseDetails.data && responseDetails.data.result
    && responseDetails.data.result.UserProfile
    && responseDetails.data.result.UserProfile.length) {
    userDepartment = responseDetails.data.result.UserProfile[0].employmentDetails.departmentName
  }
  const usrDept = userDepartment || 'igot'

  await forwardPost(connectionEndpoints.recommended, () => departmentSearch([usrDept]))(ctx)
}

export const connectionsApi = Router()

registerConnectionRoutes(connectionsApi, unknown, [
  ...connectionFetchRoutes(),
  ...profileConnectionChangeRoutes(),
  recommendedRoute('/connections/recommended', connectionEndpoints.recommended, extractUserIdFromRequest),
  {
    handle: recommendByUserDepartment,
    logLabel: recommendedLogLabel,
    method: 'post',
    path: '/connections/recommended/userDepartment',
  },
])
