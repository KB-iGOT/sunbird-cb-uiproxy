import { Router } from 'express'
import { createProxyServer } from 'http-proxy'
import { extractUserEmailFromRequest, extractUserId, extractUserToken } from '../utils/requestExtract'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'

const _ = require('lodash')

// Singleton proxy — no timeout (used by 14 existing functions)
const proxy = createProxyServer({})

// Singleton proxy with timeout — replaces per-request factory (used by 10 routes)
// Previously: const proxyCreator = (timeout) => createProxyServer({ timeout }) — leaked instances
// TODO: This is a temporary workaround to prevent unbounded proxy object creation.
// Proper fix: evaluate if these routes can use the main singleton proxy with a
// timeout, or migrate to axios streaming, eliminating the need for http-proxy here.
const proxyTimed = createProxyServer({ timeout: CONSTANTS.PROXY_TIMEOUT })
const PROXY_SLUG = '/proxies/v8'
const PROXY_SLUG_WAT = '/proxies/v8/wat'
const PROXY_SLUG_FORMS = '/proxies/v8/ext-forms'

// tslint:disable-next-line: no-any
proxy.on('proxyReq', (proxyReq: any, req: any, _res: any, _options: any) => {
  logInfo('proxyReqOn method. Adding more headers in request...')
  const rootOrg = req.headers ? req.headers.rootOrg : req.headers.rootorg
  logInfo(`rootOrg is updated: ` + JSON.stringify(rootOrg))
  // tslint:disable-next-line: no-duplicate-string
  proxyReq.setHeader('X-Channel-Id', (_.get(req, 'session.rootOrgId')) ? _.get(req, 'session.rootOrgId') : CONSTANTS.X_Channel_Id)
  // tslint:disable-next-line: max-line-length
  proxyReq.setHeader('Authorization', CONSTANTS.SB_API_KEY)
  proxyReq.setHeader('x-authenticated-user-token', extractUserToken(req))
  proxyReq.setHeader('x-authenticated-userid', extractUserId(req))
  let rootOrgId = ''
  if (req.session.hasOwnProperty('rootOrgId')) {
    rootOrgId = req.session.rootOrgId
  }
  proxyReq.setHeader('x-authenticated-user-orgid', rootOrgId)
  let userRoles = []
  if (req.session.hasOwnProperty('userRoles')) {
      userRoles = req.session.userRoles
  }
  proxyReq.setHeader('x-authenticated-user-roles', userRoles)
  let channel = ''
  if (req.session.hasOwnProperty('channel')) {
    channel = req.session.channel
  }
  proxyReq.setHeader('x-authenticated-user-orgname', channel)
  proxyReq.setHeader('x-authenticated-user-channel', channel)
  if (req.session.hasOwnProperty('uid')) {
    proxyReq.setHeader('x-authenticated-user-nodebb-uid', req.session.uid)
  }

  // condition has been added to set the session in nodebb req header
  /* tslint:disable-next-line */
  if (req.originalUrl.includes('/discussion') && !req.originalUrl.includes('/discussion/user/v1/create') && req.session) {
    if (req.session) {
      req.sesson.cookie.secure = true
    }
    if (req.body && req.session.hasOwnProperty('uid')) {
      req.body._uid = req.session.uid
    }
    logInfo('REQ_URL_ORIGINAL discussion', proxyReq.path)
  }
  if (!req.originalUrl.includes('/storage/upload') && !req.originalUrl.includes('/storage/profilePhotoUpload/*') && req.body) {
    const bodyData = JSON.stringify(req.body)
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData))
    proxyReq.write(bodyData)
  }
})

// tslint:disable-next-line: no-any
proxy.on('proxyRes', (proxyRes: any, req: any, _res: any, ) => {
  // res.removeHeader('access-control-allow-origin')
  delete proxyRes.headers['access-control-allow-origin']
  // write user session with roles
  // if (req.originalUrl.includes('/user/v2/read')) {
  //   // tslint:disable-next-line: no-any
  //   proxyRes.on('data', (data: any) => {
  //     if ((proxyRes.statusCode === 200 || proxyRes.statusCode === 201)) {
  //       data = JSON.parse(data.toString('utf-8'))
  //       const roles = data.result.response.roles
  //       req.session.userId = data.result.response.id ? data.result.response.id : data.result.response.userId
  //       req.session.userName = data.result.response.userName
  //       req.session.userRoles = roles
  //       // console.log(req);
  //       // tslint:disable-next-line: only-arrow-functions
  //       req.session.save(function(error: string) {
  //         if (error) {
  //           // tslint:disable-next-line: no-console
  //           console.log(error)
  //         }
  //       })
  //     }
  //   })
  // }
  // tslint:disable-next-line: no-any
  proxyRes.on('data', (data: any) => {
    if (req.originalUrl.includes('/discussion/user/v1/create')) {

      if ((proxyRes.statusCode === 200 || proxyRes.statusCode === 201)) {
        data = JSON.parse(data.toString('utf-8'))
        logInfo('_res==>', data)
        req.session.uid = data.result.userId.uid
      }
      const nodebbToken = '722686c6-2a2e-4b22-addf-c427261fbdc6'
      if (req.session) {
        req.session.nodebb_authorization_token = nodebbToken
      }
    }
  })

})

// Error handler — return 502 instead of crashing or hanging the connection
// tslint:disable-next-line: no-any
function handleProxyError(err: any, req: any, res: any) {
  logError('Proxy error:', String(err.message || err), '| url:', req.originalUrl || req.url)
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Bad Gateway', message: 'Upstream service unavailable' }))
  }
}

proxy.on('error', handleProxyError)
proxyTimed.on('error', handleProxyError)

export function proxyCreatorRoute(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    const downloadKeyword = '/download/'
    if (req.url.startsWith(downloadKeyword)) {
      req.url = downloadKeyword + req.url.split(downloadKeyword)[1].replace(/\//g, '%2F')
    }
    logInfo('REQ_URL_ORIGINAL', req.originalUrl)
    logInfo('REQ_URL', req.url)
    proxyTimed.web(req, res, {
      target: targetUrl,
    })
  })
  return route
}

export function ilpProxyCreatorRoute(route: Router, baseUrl: string): Router {
  route.all('/*', (req, res) => {
    proxyTimed.web(req, res, {
      headers: { ...req.headers } as { [s: string]: string },
      target: baseUrl + req.url,
    })
  })
  return route
}

export function scormProxyCreatorRoute(route: Router, baseUrl: string): Router {
  route.all('/*', (req, res) => {
    proxyTimed.web(req, res, {
      target: baseUrl,
    })
  })
  return route
}

export function proxyCreatorLearner(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    logInfo('REQ_URL_ORIGINAL proxyCreatorLearner', req.originalUrl)
    const url = removePrefix(`${PROXY_SLUG}/learner`, req.originalUrl)
    logInfo('Final URL: ', targetUrl + url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}
// tslint:disable-next-line
export function proxyCreatorSunbird(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    logInfo('REQ_URL_ORIGINAL proxyCreatorSunbird', req.originalUrl)
    let url = ''
    if (req.originalUrl.includes('/proxies/v8/wat')) {
      url = removePrefix(`${PROXY_SLUG_WAT}`, req.originalUrl)
    } else {
      url = removePrefix(`${PROXY_SLUG}`, req.originalUrl)
    }

    if (req.originalUrl.includes('/discussion') && !req.originalUrl.includes('/discussion/user/v1/create') && req.session) {
      if (req.session.hasOwnProperty('uid')) {
        if (req.originalUrl.includes('?')) {
          url = `${url}&_uid=${req.session.uid}`
        } else {
          url = `${url}?_uid=${req.session.uid}`
        }
      }
      if (req.originalUrl.includes('/discussion/v2/topics')) {
        req.body.email = extractUserEmailFromRequest(req)
      }
      logInfo('REQ_URL_ORIGINAL proxyCreatorSunbird  ======= discussion', url)
    }

    if (req.originalUrl.includes('/dashboard') && !req.originalUrl.includes('/dashboard/analytics/getChartV2/Karmayogi') && req.session) {
      if (req.originalUrl.includes('?')) {
        url = `${url}&_uid=${_.get(req, 'session.rootOrgId')}`
      } else {
        url = `${url}?_uid=${_.get(req, 'session.rootOrgId')}`
      }
      logInfo('REQ_URL_ORIGINAL proxyCreatorSunbird  ======= dashboard analytics', url)
    }

    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyCreatorKnowledge(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {

    const url = removePrefix(`${PROXY_SLUG}`, req.originalUrl)
    logInfo('REQ_URL_ORIGINAL proxyCreatorKnowledge', targetUrl + url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyCreatorUpload(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}/action`, req.originalUrl)
    logInfo('REQ_URL_ORIGINAL proxyCreatorUpload', targetUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

function removePrefix(prefix: string, s: string) {
  return s.substr(prefix.length)
}

export function proxyCreatorSunbirdSearch(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    logInfo('REQ_URL_ORIGINAL proxyCreatorSunbirdSearch', req.originalUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl,
    })
  })
  return route
}

export function proxyCreatorToAppentUserId(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    const originalUrl = req.originalUrl
    const lastIndex = originalUrl.lastIndexOf('/')
    const subStr = originalUrl.substr(lastIndex).substr(1).split('-').length
    let userId = extractUserId(req)
    if (subStr === 5 && (originalUrl.substr(lastIndex).substr(1))) {
      userId = originalUrl.substr(lastIndex).substr(1)
    }
    logInfo('REQ_URL_ORIGINAL proxyCreatorToAppentUserId', req.originalUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + userId, // [userId.length - 1],
    })
  })
  return route
}

export function proxyCreatorQML(route: Router, targetUrl: string, urlType: string, _timeout = 10000, ): Router {
  route.all('/*', (req, res) => {
    const originalUrl = req.originalUrl.replace(urlType, '/')
    const url = removePrefix(`${PROXY_SLUG}`, originalUrl)
    logInfo('REQ_URL_ORIGINAL proxyCreatorQML', targetUrl + url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyContent(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}/private`, req.originalUrl)
    logInfo('REQ_URL_ORIGINAL proxyCreatorUpload', targetUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyContentLearnerVM(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    const url = removePrefix(`${PROXY_SLUG}/learnervm/private`, req.originalUrl)
    logInfo('REQ_URL_ORIGINAL proxyContentLearnerVM', targetUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl + url,
    })
  })
  return route
}

export function proxyAssessmentRead(route: Router, targetUrl: string, _timeout = 10000): Router {
  const hierarchyQuery = 'hierarchy=detail'
  route.all('/*', (req, res) => {
    let url = removePrefix(`${PROXY_SLUG}/assessment/read`, req.originalUrl)
    // Check if the target URL already contains query parameters
    url = url.includes('?')
      ? `${targetUrl}${url}&${hierarchyQuery}`
      : `${targetUrl}${url}?${hierarchyQuery}`
    logInfo('REQ_URL_UPDATED proxyAssessmentRead', url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: url,
    })
  })
  return route
}

export function proxyQuestionRead(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    if (!targetUrl.includes('?')) {
    // Split the URL into base URL and query parameters
    const [, queryParams] = req.originalUrl.split('?')
    // Construct the final target URL by appending query parameters
    targetUrl = targetUrl + (queryParams ? `?${queryParams}` : '')
    }
    logInfo('REQ_URL_UPDATED proxyAssessmentRead', targetUrl)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: targetUrl,
    })
  })
  return route
}

export function proxyCreatorForms(route: Router, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    logInfo('REQ_URL_ORIGINAL proxyCreatorSunbird', req.originalUrl)
    let url = ''
    url = removePrefix(`${PROXY_SLUG_FORMS}`, req.originalUrl)
    proxy.web(req, res, {
      target: 'http://localhost:3003/' + url,
    })
  })
  return route
}

export function proxyAssessmentReadV2(route: Router, targetUrl: string, _timeout = 10000): Router {
  route.all('/*', (req, res) => {
    let url = removePrefix(`${PROXY_SLUG}/assessment/v5/read`, req.originalUrl)
    // Check if the target URL already contains query parameters
    if (url.includes('?')) {
      url = targetUrl + url + '&hierarchy=detail'
    } else {
      url = targetUrl + url + '?hierarchy=detail'
    }
    logInfo('REQ_URL_UPDATED proxyAssessmentReadV5', url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: url,
    })
  })
  return route
}

export function proxyAssessmentReadV7(route: Router, targetUrl: string, _timeout = 10000): Router {
  const hierarchyQuery = 'hierarchy=detail'
  route.all('/*', (req, res) => {
    let url = removePrefix(`${PROXY_SLUG}/assessment/v7/read`, req.originalUrl)
    // Append query parameter
    url = url.includes('?')
      ? `${targetUrl}${url}&${hierarchyQuery}`
      : `${targetUrl}${url}?${hierarchyQuery}`
    logInfo('REQ_URL_UPDATED proxyAssessmentReadV7', url)
    proxy.web(req, res, {
      changeOrigin: true,
      ignorePath: true,
      target: url,
    })
  })
  return route
}
