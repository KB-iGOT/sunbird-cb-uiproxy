import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logDebug } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserId, extractUserToken } from '../utils/requestExtract'
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
const getUserOrgName = `${CONSTANTS.KONG_API_BASE}/user/v1/search`

/**
 * @author: Suvajit
 * Step 1: Gets the User Department using search api
 * Step 2: Loops through and gets all the dept
 * Step 3: Send the data to recommandation api
 */
async function recommendByUserDepartment(ctx: IConnectionContext) {
  const { req, res, userId } = ctx
  const body = {
    request: {
      filters: {
        userId,
      },
      query: '',
    },
  }
  const responseDetails = await axios.post(getUserOrgName, body, {
    ...axiosRequestConfig,
    headers: {
      Authorization: CONSTANTS.SB_API_KEY,
      'Content-Type': 'application/json',
      'X-Authenticated-User-Token': extractUserToken(req),
    },
  })
  logDebug('responseDetails from /search/ : ', JSON.stringify(responseDetails.data))

  // tslint:disable-next-line: no-any
  const orgData: any[] = []
  const contentData = responseDetails.data.result.response.content
  // tslint:disable-next-line: no-any
  contentData.forEach((content: any) => {
    const orgs = content.organisations
    // tslint:disable-next-line: no-any
    orgs.forEach((org: any) => {
      orgData.push(org)
    })
  })
  if (!orgData.length) {
    res.status(400).send(ERROR.ERROR_NO_DEPT_DATA)
    return
  }

  const userDepartment = orgData.map((org) => org.orgName)
  await forwardPost(connectionEndpoints.recommended, () => departmentSearch(userDepartment))(ctx)
}

export const connectionsV2Api = Router()

registerConnectionRoutes(connectionsV2Api, unknown, [
  ...connectionFetchRoutes('/v2', extractUserId),
  ...profileConnectionChangeRoutes('/v2'),
  recommendedRoute('/v2/connections/recommended', connectionEndpoints.recommended, extractUserId),
  {
    getUserId: extractUserId,
    handle: recommendByUserDepartment,
    logLabel: recommendedLogLabel,
    method: 'post',
    path: '/v2/connections/recommended/userDepartment',
  },
])
