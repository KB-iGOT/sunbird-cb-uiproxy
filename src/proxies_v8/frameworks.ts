import axios, { Method } from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'
import { extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'

export const frameworksApi = express.Router()
const _ = require('lodash')

frameworksApi.use('/*', async (req, res) => {
  try {
    logInfo(req.originalUrl)
    const url = removePrefix('/proxies/v8', req.originalUrl)
    logInfo(`The url is... ${url} : rootOrgId: ${req.originalUrl}`)
    const userRoleData = _.get(req, 'session.userRoles')
    const userRootOrgId = _.get(req, 'session.rootOrgId')
    logInfo(`Framework API call: Users Roles are... ${userRoleData} : rootOrgId: ${userRootOrgId}`)

    const masterFrameworkCategory = CONSTANTS.FRAMEWORK_ALLOWED_UPDATE_CATEGORY.split(',')
    const allowedRoles = CONSTANTS.FRAMEWORK_MASTER_ALLOWED_UPDATE_ROLE.split(',')

    let orgId

    if (url.includes('/publish/')) {
      orgId = extractPublishId(url)
    } else if (url.includes('/create/') || url.includes('/update/')) {
      orgId = extractFrameworkId(url)
    } else {
      // Handle other requests outside of create/update/publish
      await sendFrameworkAPIRequest(req, res, url, userRootOrgId)
      return
    }

    if (url.includes('/publish/') || url.includes('/create/') || url.includes('/update/')) {
      if (orgId && !isNaN(Number(orgId))) {
        if (masterFrameworkCategory.includes(orgId)) {
          const hasRole = userRoleData.some((role: string) => allowedRoles.includes(role))
          if (!hasRole) {
            return res.status(403).send('User does not have the required role to update the framework')
          }
        }
      } else if (orgId && orgId !== userRootOrgId) {
        return res.status(403).send('orgId does not match rootOrgId')
      }
    }

    logInfo(`Extracted Framework or Publish ID: ${orgId}`)

    // Proceed with the API request if all conditions are met
    await sendFrameworkAPIRequest(req, res, url, userRootOrgId)
    return

  } catch (err) {
    logError(`Framework API call failed: ${err.message}`)
    return res.status(500).send(err.message)
  }
})

// Function to extract framework ID and handle the integer after the underscore
const extractFrameworkId = (url: string): string => {
  const urlParams = new URLSearchParams(url.split('?')[1])
  const framework = urlParams.get('framework')

  if (framework) {
    const parts = framework.split('_')
    logInfo(`FrameworkParts: ${parts}`)
    return parts.length > 1 && isNaN(Number(parts[0])) ? parts[0] : framework
  }
  return ''
}

// Function to handle publish URL and extract the ID
const extractPublishId = (url: string): string | null => {
  const publishMatch = url.match(/\/publish\/([^_]+)/)
  return publishMatch ? publishMatch[1] : null
}

// Generic function to send the API request
const sendFrameworkAPIRequest = async (req: express.Request, res: express.Response, url: string, userRootOrgId: string) => {
  try {
    logInfo(`sendFrameworkAPIRequest the url is... ${url} : rootOrgId: ${userRootOrgId} :::: ${CONSTANTS.KONG_API_BASE} + ${url}`)
    const method: Method = req.method as Method
    logInfo(method)
    const response = await axios({
      ...axiosRequestConfig,
      data: req.body,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'x-authenticated-user-id': extractUserIdFromRequest(req),
        'x-authenticated-user-orgid': userRootOrgId,
        'x-authenticated-user-token': extractUserToken(req),
      },
      method,
      url: `${CONSTANTS.KONG_API_BASE} + ${url}`, // Construct the full URL
    })

    res.status(response.status).send(response.data)
  } catch (err) {
    logError(`API call failed: ${err.message}`)
    res.status(500).send(err.message)
  }
}

function removePrefix(prefix: string, s: string): string {
  return s.startsWith(prefix) ? s.substring(prefix.length) : s
}
