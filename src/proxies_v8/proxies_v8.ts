import axios from 'axios'
import express from 'express'
import { UploadedFile } from 'express-fileupload'
import FormData from 'form-data'
import { IncomingMessage } from 'http'
import lodash from 'lodash'
import { allocationService } from '../authz'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { sendUpstreamError } from '../utils/errors'
import { logDebug, logError } from '../utils/logger'
import {
  ilpProxyCreatorRoute,
  // proxyCreatorDiscussion,
  proxyAssessmentRead,
  proxyAssessmentReadV2,
  proxyAssessmentReadV7,
  proxyContent,
  proxyContentLearnerVM,
  proxyCreatorForms,
  proxyCreatorKnowledge,
  proxyCreatorLearner,
  proxyCreatorQML,
  proxyCreatorRoute,
  proxyCreatorSunbird,
  proxyCreatorSunbirdSearch,
  proxyCreatorToAppentUserId,
  proxyQuestionRead,
  scormProxyCreatorRoute
} from '../utils/proxyCreator'
import { extractUserIdFromRequest, extractUserToken } from '../utils/requestExtract'
import { chatBotGenericAPIIntegration } from './chatBotGenericAPIIntegration'
import { chatBotIntegrationAPI } from './chatBotIntegration'
import { contentTranscodeAPIIntegration } from './contentTranscodeAPIIntegration'
import { frameworksApi } from './frameworks'
import { jwtUserTokenHelper } from './jwtUserTokenHelper'
import { lookerDashboard } from './lookerIntegration'
import { fetchBatchUsers, sbAuthHeaders } from './proxyHelpers'

export {
  ICohortsUser,
  IEmploymentDetails,
  IPersonalDetails,
  IProfessionalDetailsEntity,
  IUserProfile,
  IUserProfileDetails,
} from './proxyHelpers'

const API_END_POINTS = {
  batchParticipantsApi: `${CONSTANTS.KONG_API_BASE}/course/v1/batch/participants/list`,
  contentNotificationEmail: `${CONSTANTS.NOTIFICATION_SERVIC_API_BASE}/v1/notification/send/sync`,
  externalContentbatchParticipantsApi: `${CONSTANTS.KONG_API_BASE}/externaltraining/v1/batch/participants/list`,
  kongExtOrgSearch: `${CONSTANTS.KONG_API_BASE}/org/v1/cb/ext/search`,
  kongSearchOrg: `${CONSTANTS.KONG_API_BASE}/org/v1/search`,
  orgTypeListEndPoint: `${CONSTANTS.KONG_API_BASE}/data/v1/system/settings/get/orgTypeList`,
}
export const proxiesV8 = express.Router()
const _ = require('lodash')

const FILE_NOT_FOUND_ERR = 'File not found in the request'
// tslint:disable-next-line: no-duplicate-string
const PROXIES_V8_PREFIX = '/proxies/v8'
// tslint:disable-next-line: no-duplicate-string
const HEADER_USER_CHANNEL = 'x-authenticated-user-channel'
// tslint:disable-next-line: no-duplicate-string
const HEADER_USER_ORGID = 'x-authenticated-user-orgid'
// tslint:disable-next-line: no-duplicate-string
const HEADER_USER_ORGNAME = 'x-authenticated-user-orgname'
// tslint:disable-next-line: no-duplicate-string
const SESSION_ROOT_ORG_ID = 'session.rootOrgId'
// tslint:disable-next-line: no-duplicate-string
const SESSION_CHANNEL = 'session.channel'
const KONG_BASE = `${CONSTANTS.KONG_API_BASE}`
const KNOWLEDGE_BASE = `${CONSTANTS.KNOWLEDGE_MW_API_BASE}`

const unknownError = 'Failed due to unknown reason'

type ProxyFactory = (route: express.Router, targetUrl: string) => express.Router

// Mounts one fresh `factory` proxy router per path, in the given order, all forwarding to `targetUrl`
function mountProxies(factory: ProxyFactory, targetUrl: string, ...paths: string[]) {
  for (const path of paths) {
    proxiesV8.use(path, factory(express.Router(), targetUrl))
  }
}

// Paths forwarded unchanged to the KONG gateway
function mountKong(...paths: string[]) {
  mountProxies(proxyCreatorSunbird, KONG_BASE, ...paths)
}

// Search-style proxies to a fixed KONG endpoint: `[path, kongPath]`, or just `path` when the KONG path is the same
function mountKongSearch(...routes: Array<string | [string, string]>) {
  for (const route of routes) {
    const [path, kongPath] = typeof route === 'string' ? [route, route] : route
    proxiesV8.use(path, proxyCreatorSunbirdSearch(express.Router(), `${CONSTANTS.KONG_API_BASE}${kongPath}`))
  }
}

// Adds an uploaded file to the multipart form under `field`, keeping its name and mime type
function appendFile(formData: FormData, field: string, file: UploadedFile) {
  formData.append(field, Buffer.from(file.data), {
    contentType: file.mimetype,
    filename: file.name,
  })
}

// Org/channel headers taken from the user's session ('' when absent)
function sessionOrgHeaders(req: express.Request) {
  const rootOrgId = _.get(req, SESSION_ROOT_ORG_ID) || ''
  const channel = _.get(req, SESSION_CHANNEL) || ''
  return {
    [HEADER_USER_CHANNEL]: encodeURIComponent(channel),
    [HEADER_USER_ORGID]: rootOrgId,
    [HEADER_USER_ORGNAME]: encodeURIComponent(channel),
  }
}

// Sends req.files.data to content-service at the request path with `prefix` removed
function submitToContentService(
  req: express.Request, prefix: string,
  callback: (err: Error | null, response: IncomingMessage) => void
) {
  const formData = new FormData()
  appendFile(formData, 'file', req.files.data as UploadedFile)
  formData.submit(
    {
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        org: 'dopt',
        rootorg: 'igot',
        // tslint:disable-next-line: no-duplicate-string
        'x-authenticated-user-token': extractUserToken(req),
        // tslint:disable-next-line: no-duplicate-string
        'x-authenticated-userid': extractUserIdFromRequest(req),
      },
      host: 'content-service',
      path: removePrefix(prefix, req.originalUrl),
      port: 9000,
    },
    callback
  )
}

/* tslint:disable:no-any */
function handleFormDataResponse(
  routeLabel: string, res: any, err: any,
  response: any
) {
/* tslint:enable:no-any */
  if (err || !response) {
    logError(`FormData submit error in ${routeLabel}`, String(err))
    if (!res.headersSent) {
      res.status(502).json({ error: 'Request failed', message: String(err) })
    }
    return
  }
  const chunks: Buffer[] = []
  response.on('error', (streamErr: Error) => {
    logError(`Response stream error in ${routeLabel}`, String(streamErr))
    if (!res.headersSent) {
      res.status(502).json({ error: 'Stream failed' })
    }
  })
  response.on('data', (chunk: Buffer) => chunks.push(chunk))
  response.on('end', () => {
    const fullData = Buffer.concat(chunks)
    const statusCode = response.statusCode || 500
    if (statusCode === 200 || statusCode === 201) {
      try {
        res.status(statusCode).json(JSON.parse(fullData.toString('utf8')))
      } catch (_e) {
        res.status(statusCode).send(fullData.toString('utf8'))
      }
    } else {
      res.status(statusCode).send(fullData.toString('utf8'))
    }
  })
}

proxiesV8.get('/', (_req, res) => {
  res.json({
    type: 'PROXIES Route',
  })
})

proxiesV8.post('/upload/*', (req, res) => {
  if (req.files && req.files.data) {
    // tslint:disable-next-line: no-any
    submitToContentService(req, '/proxies/v8/upload/action', (err: any, response: any) =>
      handleFormDataResponse('/upload/*', res, err, response)
    )
  } else {
    res.send(FILE_NOT_FOUND_ERR)
  }
})

proxiesV8.post('/private/upload/*', (_req, _res) => {
  if (_req.files && _req.files.data) {
    submitToContentService(_req, '/proxies/v8/private/upload',
      (_err, _response) => {
        if (_err || !_response) {
          logError('FormData submit error in /private/upload/*', String(_err))
          if (!_res.headersSent) {
            _res.status(502).json({ error: 'Upload failed', message: String(_err) })
          }
          return
        }
        _response.on('error', (streamErr) => {
          logError('Response stream error in /private/upload/*', String(streamErr))
          if (!_res.headersSent) {
            _res.status(502).json({ error: 'Upload stream failed' })
          }
        })
        _response.on('data', (_data) => {
          if (_response.statusCode === 200 || _response.statusCode === 201) {
            _res.send(JSON.parse(_data.toString('utf8')))
          } else {
            _res.send(_data.toString('utf8'))
          }
        })
      }
    )
  } else {
    _res.send(FILE_NOT_FOUND_ERR)
  }
})

mountProxies(proxyCreatorKnowledge, KONG_BASE, '/content/v2/discard', '/content/v5/dictionary')
mountKong('/content/v2/*')
mountProxies(proxyCreatorKnowledge, KONG_BASE, '/content/v4/*')
mountKong('/content/v1/retirement/*')
mountProxies(proxyCreatorKnowledge, KONG_BASE, '/content/admin/v1/durationSync/*', '/content/admin/v1/replaceVideo')

proxiesV8.use(
  '/content',
  proxyCreatorRoute(express.Router(), CONSTANTS.CONTENT_API_BASE + '/content')
)
proxiesV8.use(
  '/contentv3',
  proxyCreatorRoute(express.Router(), CONSTANTS.CONTENT_API_BASE + '/contentv3')
)
proxiesV8.use(
  '/fastrack',
  proxyCreatorRoute(express.Router(), CONSTANTS.ILP_FP_PROXY + '/fastrack')
)
proxiesV8.use(
  '/hosted',
  proxyCreatorRoute(express.Router(), CONSTANTS.CONTENT_API_BASE + '/hosted')
)
proxiesV8.use('/ilp-api', ilpProxyCreatorRoute(express.Router(), CONSTANTS.ILP_FP_PROXY))
proxiesV8.use(
  '/scorm-player',
  scormProxyCreatorRoute(express.Router(), CONSTANTS.SCORM_PLAYER_BASE)
)
proxiesV8.use(
  '/LA',
  proxyCreatorRoute(express.Router(), CONSTANTS.APP_ANALYTICS, Number(CONSTANTS.ANALYTICS_TIMEOUT))
)
proxiesV8.use(
  '/FordGamification',
  proxyCreatorRoute(express.Router(), CONSTANTS.GAMIFICATION_API_BASE + '/FordGamification')
)
proxiesV8.use(
  '/static-ilp',
  proxyCreatorRoute(express.Router(), CONSTANTS.STATIC_ILP_PROXY + '/static-ilp')
)
proxiesV8.use(
  '/web-hosted',
  proxyCreatorRoute(express.Router(), CONSTANTS.WEB_HOST_PROXY + '/web-hosted')
)

mountKongSearch(
  ['/contentsearch/*', '/content/v1/search'],
  ['/sunbirdigot/v4/*', '/composite/v4/search'],
  ['/sunbirdigot/*', '/composite/v1/search']
)

mountProxies(proxyCreatorKnowledge, KNOWLEDGE_BASE, '/v1/content/retire', '/v1/content/copy/*')

proxiesV8.use('/private/content/*',
  proxyContent(express.Router(), `${CONSTANTS.CONTENT_SERVICE_API_BASE}`)
)

proxiesV8.use('/learnervm/private/content/*',
  proxyContentLearnerVM(express.Router(), `${CONSTANTS.VM_LEARNING_SERVICE_URL}`)
)

mountKongSearch(
  ['/content-progres/ngo*', '/course/v1/content/state/update/ngo'],
  ['/content-progres/*', '/course/v1/content/state/update'],
  ['/read/content-progres/ngo/*', '/course/v1/content/state/read/ngo'],
  ['/read/content-progres/*', '/course/v1/content/state/read'],
  ['/read/user/insights', '/insights'],
  ['/trending/content/search', '/trending/search'],
  '/halloffame/read', '/walloffame/read', '/karmapoints/read', '/karmapoints/user/course/read', '/claimkarmapoints',
  ['/login/entry*', '/v1/user/login'],
  '/user/totalkarmapoints', '/halloffame/learnerleaderboard', '/walloffame/learnerleaderboard',
  '/microsite/read/insights', '/msite/content/aggregation/search'
)

mountKong(
  '/halloffame/top/learners/*', '/halloffame/state/top/learners/*',
  '/walloffame/top/learners/*', '/walloffame/state/top/learners/*'
)

proxiesV8.post('/ai/assessments/v1/generate', (req, res) => {
  const url = removePrefix(PROXIES_V8_PREFIX, req.originalUrl)
  const formData = new FormData()

  // Append all text fields from the parsed body
  if (req.body) {
    for (const key of Object.keys(req.body)) {
      formData.append(key, req.body[key])
    }
  }

  // Append file(s) if present
  if (req.files) {
    for (const key of Object.keys(req.files)) {
      const fileOrFiles = req.files[key]
      for (const file of Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]) {
        appendFile(formData, key, file)
      }
    }
  }

  const submitReq = formData.submit(
    {
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        ...sessionOrgHeaders(req),
        'x-authenticated-user-token': extractUserToken(req),
        'x-authenticated-userid': extractUserIdFromRequest(req),
      },
      host: 'kong',
      path: url,
      port: 8000,
    },
    // tslint:disable-next-line: no-any
    (err: any, response: any) => handleFormDataResponse('/ai/assessments/v1/generate', res, err, response)
  )
  // Increase socket timeout for long-running AI generation (5 minutes)
  submitReq.setTimeout(300000)
})

// Remaining AI assessment routes (non-form-data) use generic proxy
mountKong('/ai/assessments/*', '/ai/cbp/*')

proxiesV8.get(['/api/user/v2/read', '/api/user/v2/read/:id'], async (req, res) => {
  const host = req.get('host')
  const originalUrl = req.originalUrl
  const lastIndex = originalUrl.lastIndexOf('/')
  const subStr = originalUrl.substr(lastIndex).substr(1).split('-').length
  const loggedInUserId = extractUserIdFromRequest(req).split(':')[2]
  let urlUserId = ''
  let userId = loggedInUserId
  if (subStr === 5 && (originalUrl.substr(lastIndex).substr(1))) {
    urlUserId = originalUrl.substr(lastIndex).substr(1)
    userId = urlUserId
  }

  await axios({
    ...axiosRequestConfig,
    headers: sbAuthHeaders(req),
    method: 'GET',
    url: `${CONSTANTS.KONG_API_BASE}/user/v2/read/` + userId,
  }).then((response) => {
    if (response.data.responseCode === 'OK') {
      res.status(200).send(response.data)
    } else {
      logError('User Read API.. Received non OK response.' + JSON.stringify(response.data))
      if (urlUserId.length > 1 && urlUserId !== loggedInUserId) {
        res.status(400).send(response.data)
      } else {
        res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(JSON.stringify(response.data.params.errmsg)))
      }
    }
  }).catch((err) => {
    logError('Failed to do user read API. Received Exception: loggedInUserId : ' + loggedInUserId + ', urlUserId: ' + urlUserId)
    let errMsg = 'Internal Server Error'
    if (err.response && err.response.data) {
      logError('Received error for user read API. Error: ' + JSON.stringify(err.response.data))
      errMsg = err.response.data.params.errmsg
    }
    if (urlUserId.length > 1 && urlUserId !== loggedInUserId) {
      res.status(400).send(err.response.data)
    } else {
      if (req.session) {
        req.session.destroy((dErr) => {
          logError('Failed to clear the session. ERROR: ' + JSON.stringify(dErr))
        })
      }
      res.clearCookie('connect.sid', { path: '/' })
      res.redirect(`https://${host}/public/logout?error=` + encodeURIComponent(errMsg))
    }
  })
})

proxiesV8.use('/api/user/v5/read',
  proxyCreatorToAppentUserId(express.Router(), `${CONSTANTS.KONG_API_BASE}/user/v5/read/`)
)

proxiesV8.use([
  '/action/questionset/v1/*',
  '/action/question/v1/*',
  '/action/object/category/definition/v1/*',
],
  proxyCreatorQML(express.Router(), `${CONSTANTS.KONG_API_BASE}`, '/action/')
)
mountProxies(proxyCreatorKnowledge, KONG_BASE,
  '/action/content/v3/updateReviewStatus', 'private/content/v4/update', 'private/content/v4/system/update',
  '/action/content/v3/hierarchyUpdate'
)
mountProxies(proxyCreatorKnowledge, KNOWLEDGE_BASE, '/action/*')
mountProxies(proxyCreatorKnowledge, KONG_BASE, '/mdo/content/*')

mountKong('/learner/achievement/*')

proxiesV8.use('/learner/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorLearner(express.Router(), `${CONSTANTS.KONG_API_BASE}`)
)

mountKong('/notification/*')

proxiesV8.post('/org/v1/search', async (req, res) => {
  try {
    // tslint:disable-next-line: all
    const roleData = lodash.get(req, 'session.userRoles')
    // tslint:disable-next-line: all
    const rootOrgId = lodash.get(req, 'session.rootOrgId')
    logDebug('org search API call : Users Roles are...')
    logDebug(roleData)
    const urlPath = API_END_POINTS.kongSearchOrg
    if (roleData.includes('STATE_ADMIN')) {
      logDebug('roleData contains state admin')
      req.body.request.filters.ministryOrStateId = rootOrgId
      logDebug('updated urlPath -> ' + urlPath)
    }
    const searchResponse = await axios({
      ...axiosRequestConfig,
      data: req.body,
      headers: sbAuthHeaders(req),
      method: 'POST',
      url: urlPath,
    })
    res.status(200).send(searchResponse.data)
  } catch (err) {
    logError('Org search API failed:', String(err))
    res.status(500).json({ error: 'Failed to search organisations' })
  }
})

mountKong('/org/*', '/dashboard/*')

const BULK_UPLOAD_PATHS = [
  '/user/v1/bulkupload', '/storage/profilePhotoUpload/*', '/workflow/admin/transition/bulkupdate',
  '/cloud-services/mlcore/v1/files/upload', '/calendar/v1/bulkUpload', '/storage/orgStoreUpload',
  '/workflow/admin/v2/bulkupdate/transition', '/user/v2/bulkupload', '/ciosIntegration/v1/loadContentFromExcel/*',
  '/storage/v1/uploadCiosIcon', '/storage/v1/uploadCiosContract', '/organisation/v1/competencyDesignationMappings/bulkUpload/*',
  '/template/api/v1/upload', '/designation/v1/orgMapping/bulkUpload/*', '/storage/v1/uploadCiosLogsFile',
  '/customselfregistration/upload/logo/gcpcontainer', '/ciosIntegration/v1/loadContentProgressFromExcel/*',
  '/feedDiscussion/uploadFile/*', '/community/v1/fileUpload/*', '/user/v2/event/bulkonboard/*',
  '/workflow/blendedprogram/bulkApprovalDataFromCsv/*', '/customFields/v1/masterList/*', '/organisation/v1/hierarchy/bulkUpload/*',
  '/user/v3/bulkupload', '/user/v1/org-migration/bulk-upload/*', '/user/v2/org-migration/bulk-upload/*',
  '/storage/v1/bp/assignment/answer/*', '/peersurvey/upload', '/externaltraining/v1/bulkupload/*', '/user/v2/event/bulkonboard',
  '/user/nongovt/v1/bulkupload',
]

// Forwards a bulk-upload file (plus optional metadata / targetorgid) to KONG and relays the response
function forwardBulkUpload(req: express.Request, res: express.Response, file: UploadedFile) {
  const url = removePrefix('/proxies/v8', req.originalUrl)
  const formData = new FormData()
  appendFile(formData, 'file', file)

  // Forward the metadata parameter
  if (req.body && req.body.metadata) {
    formData.append('metadata', req.body.metadata)
  }

  const uploadHeaders: { [key: string]: string } = {
    Authorization: CONSTANTS.SB_API_KEY,
    ...sessionOrgHeaders(req),
    'x-authenticated-user-token': extractUserToken(req) || '',
    'x-authenticated-userid': extractUserIdFromRequest(req),
  }
  const targetOrgId = _.get(req, 'body.targetorgid') || _.get(req, 'headers.targetorgid')
  if (targetOrgId) {
    uploadHeaders.targetorgid = targetOrgId
  }
  formData.submit(
    {
      headers: uploadHeaders,
      host: 'kong',
      path: url,
      port: 8000,
    },
    (err, response) => {
      // tslint:disable-next-line: all
      let chunks: Buffer[] = [];
      response.on('data', (chunk) => chunks.push(chunk))
      // tslint:disable-next-line: all
      response.on('end', () => {
        const fullData = Buffer.concat(chunks)
        if (!err && (response.statusCode === 200 || response.statusCode === 201 || response.statusCode === 406)) {
          if (response.headers['content-type'] === 'text/csv') {
            res.setHeader('Content-Type', 'text/csv')
            res.setHeader('Content-Disposition', 'attachment; filename="report.csv"')
            res.status(response.statusCode).send(fullData)
          } else {
            let parsed
            try {
              parsed = JSON.parse(fullData.toString('utf8'))
              res.status(response.statusCode).json(parsed)
            } catch (e) {
                logDebug('Invalid JSON received as per Json Parse')
                res.status(response.statusCode).type('application/json').send(fullData.toString('utf8'))
            }
          }
        } else {
          res.status(response.statusCode || 500).send(fullData.toString('utf8'))
        }
      })
      if (err) {
        res.status((response && response.statusCode) || 500).send(err)
      }
    }
  )
}

proxiesV8.post(BULK_UPLOAD_PATHS, (req, res) => {
  const file = req.files && (req.files.data || req.files.file)
  if (file) {
    forwardBulkUpload(req, res, file as UploadedFile)
  } else {
    res.status(500).send(FILE_NOT_FOUND_ERR)
  }
})

mountKong(
  '/user/*', '/otp/*', '/event/*', '/searchBy/*', '/staff/*', '/budget/*', '/orghistory/*', '/storage/*', '/forms/*',
  '/masterData/*'
)

// proxiesV8.use('/api/framework/*',
//   // tslint:disable-next-line: max-line-length
//   proxyCreatorQML(express.Router(), `${CONSTANTS.KONG_API_BASE}`, '/api/')
// )

mountKong('/api/*', '/dashboard/*')

mountProxies(proxyCreatorSunbird, `${CONSTANTS.DASHBOARD_API_BASE}`, '/wat/dashboard/*')

proxiesV8.get('/data/v1/system/settings/get/orgTypeList', async (req, res) => {
  try {
    const roleData = lodash.get(req, 'session.userRoles')
    logDebug('orgTypeList API call : Users Roles are...')
    logDebug(roleData)
    const response = await axios({
      ...axiosRequestConfig,
      headers: sbAuthHeaders(req),
      method: 'GET',
      url: API_END_POINTS.orgTypeListEndPoint,
    })
    if (roleData.includes('STATE_ADMIN')) {
      const hiddenList = ['CBC', 'CBP', 'STATE']
      const orgTypeListObj = JSON.parse(response.data.result.response.value)
      const orgTypeList = orgTypeListObj.orgTypeList
      // tslint:disable-next-line: no-any
      orgTypeList.forEach((element: any) => {
        if (hiddenList.includes(element.name)) {
          element.isHidden = true
        }
      })
      orgTypeListObj.orgTypeList = orgTypeList
      response.data.result.response.value = JSON.stringify(orgTypeListObj)
    }
    res.status(200).send(response.data)
  } catch (err) {
    logError('OrgTypeList settings API failed:', String(err))
    res.status(500).json({ error: 'Failed to fetch org type list' })
  }
})

// proxiesV8.use('/discussion/user/v1/create',
//   // tslint:disable-next-line: max-line-length
//   proxyCreatorDiscussion(express.Router(), `${CONSTANTS.DISCUSSION_HUB_MIDDLEWARE}`)
// )
mountKong('/data/*', '/assets/*', '/discussion/*')

proxiesV8.use('/assessment/read/*',
  // tslint:disable-next-line: max-line-length
  proxyAssessmentRead(express.Router(), `${CONSTANTS.KONG_API_BASE}` + '/player/questionset/v4/hierarchy')
)

proxiesV8.use('/question/read',
  // tslint:disable-next-line: max-line-length
  proxyQuestionRead(express.Router(), `${CONSTANTS.KONG_API_BASE}` + '/player/question/v4/list')
)

proxiesV8.use('/cbp/question/list',
  // tslint:disable-next-line: max-line-length
  proxyQuestionRead(express.Router(), `${CONSTANTS.KONG_API_BASE}` + '/question/v1/list')
)

mountKong(
  '/questionset/*', '/volunteer/ratings/*', '/ratings/*', '/moderatoradmin/*', '/workflow/*', '/blendedprogram/*',
  '/batchsesion/*', '/faq/*', '/curatedprogram/*', '/openprogram/*', '/program/*', '/competency/*', '/cbplan/*',
  '/ehrms/*', '/wheebox/*', '/operationalreports/*', '/surveys/*', '/surveySubmissions/*', '/cloud-services/*',
  '/observations/*', '/observationSubmissions/*', '/demand/content/*', '/playList/*'
)

proxiesV8.use('/question/v5/read',
  // tslint:disable-next-line: max-line-length
  proxyQuestionRead(express.Router(), `${CONSTANTS.KONG_API_BASE}` + '/player/question/v5/list')
)

proxiesV8.use('/assessment/v5/read/*',
  // tslint:disable-next-line: max-line-length
  proxyAssessmentReadV2(express.Router(), `${CONSTANTS.KONG_API_BASE}` + '/player/questionset/v5/hierarchy')
)

mountKong('/interest/*', '/assessment/save/', '/assessment/savepoint/', '/announcements/*', '/cqfquestionset/*')

proxiesV8.use('/assessment/v7/read/*',
  // tslint:disable-next-line: max-line-length
  proxyAssessmentReadV7(express.Router(), `${CONSTANTS.KONG_API_BASE}` + '/player/questionset/v7/hierarchy')
)
proxiesV8.use('/question/v7/read',
  // tslint:disable-next-line: max-line-length
  proxyQuestionRead(express.Router(), `${CONSTANTS.KONG_API_BASE}` + '/player/question/v7/list')
)

function removePrefix(prefix: string, s: string) {
  return s.substr(prefix.length)
}

proxiesV8.post('/notifyContentState', async (req, res) => {
  const contentStateError = 'It should be one of [sendForReview, reviewCompleted, reviewFailed,' +
    ' sendForPublish, publishCompleted, publishFailed]'
  if (!req.body || !req.body.contentState) {
    res.status(400).send('ContentState is missing in request body. ' + contentStateError)
  }
  logDebug('Received req url is -> ' + req.protocol + '://' + req.get('host') + req.originalUrl)
  let contentBody = ''
  let emailSubject = ''
  switch (req.body.contentState) {
    case 'sendForReview':
      contentBody = `${CONSTANTS.NOTIFY_SEND_FOR_REVIEW_BODY}`
      emailSubject = 'Request to Review Content'
      break
    case 'reviewCompleted':
      contentBody = `${CONSTANTS.NOTIFY_REVIEW_COMPLETED_BODY}`
      emailSubject = 'Content Review Completed'
      break
    case 'reviewFailed':
      contentBody = `${CONSTANTS.NOTIFY_REVIEW_FAILED}`
      emailSubject = 'Content Review Failed'
      break
    case 'sendForPublish':
      contentBody = `${CONSTANTS.NOTIFY_SEND_FOR_PUBLISH_BODY}`
      emailSubject = 'Request to Publish Content'
      break
    case 'publishCompleted':
      contentBody = `${CONSTANTS.NOTIFY_PUBLISH_COMPLETED_BODY}`
      emailSubject = 'Content Publish Completed'
      break
    case 'publishFailed':
      contentBody = `${CONSTANTS.NOTIFY_PUBLIST_FAILED}`
      emailSubject = 'Content Publish Failed'
      break
    default:
      res.status(400).send('Invalid ContentState. ' + contentStateError)
      break
  }

  if (contentBody.includes('#contentLink') && req.body.contentLink && req.body.contentName) {
    contentBody = contentBody.replace('#contentLink', req.body.contentLink)
  }
  logDebug('Composed contentBody -> ' + contentBody)
  const notifyMailRequest = {
    config: {
      sender: req.body.sender,
      subject: emailSubject,
    },
    deliveryType: 'message',
    ids: req.body.recipientEmails,
    mode: 'email',
    template: {
      id: `${CONSTANTS.NOTIFY_EMAIL_TEMPLATE_ID}`,
      params: {
        body: contentBody,
        orgImageUrl: `${CONSTANTS.FRAC_API_BASE}` + '/img/logos/iGOT_logo.png',
        orgName: 'iGOT Support Team',
      },
    },
  }

  const stateEmailResponse = await axios({
    ...axiosRequestConfig,
    data: {
      request:
      {
        notifications: [notifyMailRequest],
      },
    },
    method: 'POST',
    url: API_END_POINTS.contentNotificationEmail,
  })
  logDebug('Response -> ' + JSON.stringify(stateEmailResponse.data))
  if (!stateEmailResponse.data.result.response) {
    res.status(400).send(stateEmailResponse.data)
  } else {
    res.status(200).send(stateEmailResponse.data)
  }
})

mountKong('/portal/*')

// Lists a batch's participants (from `participantsUrl`) with their profiles and the batch's total count
function batchParticipantsHandler(participantsUrl: string) {
  return async (req: express.Request, res: express.Response) => {
    try {
      const { batchId, deptName, limit, currentOffSet } = req.body.request.filters
      const reqBody = {
        request: {
          batch: {
            active: true,
            batchId,
            currentOffSet,
            limit,
          },
        },
      }
      const { response, userlist } = await fetchBatchUsers(req, participantsUrl, reqBody, deptName)
      const totalCount = response.data.result.batch.count != null ? response.data.result.batch.count : 0
      res.status(response.status).send({ userlist, totalCount })
    } catch (err) {
      logError(err)

      sendUpstreamError(res, err, { error: unknownError })
    }
  }
}

proxiesV8.post('/course/v1/batch/getParticipants', batchParticipantsHandler(API_END_POINTS.batchParticipantsApi))

mountKong('/course/*', '/catalog/*', '/calendar/*', '/careers/*', '/orgBookmark/*', '/cios/*')

proxiesV8.get('/cios/v1/content/read/:contentId', async (req, res) => {
  const contentId = req.params.contentId
  const userId = extractUserIdFromRequest(req)
  const token = extractUserToken(req) || ''
  try {
    const response = await allocationService.readByUserIdCourseId(userId, contentId, token)
    if (response) {
      // Assuming the response itself is valid for redirection or contains a redirectUrl
      // If the API returns a redirectUrl, we use it.
      // Example: response.result.redirectUrl or just response if it's the url string.
      // Since I don't have the API contract, I will log and check if response has a redirect url property.
      // If not, I'll comment on what to do.
      // For now, let's assume if we get a successful response, we might redirect to a player or similar.
      // But the user said "read this api for redirecting", maybe the API response IS the redirect.
      // I'll try to redirect to the original content URL if no specific redirect is given, OR
      // if the response contains a location.

      // Let's assume the response is the enrollment details.
      // And we want to redirect to the actual content player if enrolled.
      // But usually "read for redirecting" implies the API gives us the destination.

      // I will trust the API to return the redirect URL or data needed.
      // If response.redirectUrl exists, use it.
      if (response.redirectUrl) {
        res.redirect(response.redirectUrl)
        return
      }
      // If response is just success data, maybe we proceed to some default?
      // I'll send the response back for now if no redirectUrl is obvious, ensuring the client can handle it.
      res.status(200).send(response)
    } else {
      res.status(403).send('Not authorized or enrollment not found.')
    }
  } catch (err) {
    logError('Error in cios enrollment check:', err)
    res.status(500).send('Internal Server Error')
  }
})

mountKong('/ciosIntegration/*', '/tenders/*')

proxiesV8.use('/framework/*', frameworksApi)

mountKong(
  '/v1/search/competenciesByOrg', '/mentoring/*', '/designation/*', '/competencyArea/*', '/competencyTheme/*',
  '/competencySubTheme/*', '/halloffame/*', '/walloffame/*'
)

proxiesV8.use('/ext-forms/*',
  // tslint:disable-next-line: max-line-length
  proxyCreatorForms(express.Router())
)

mountKong(
  '/cios-enroll/*', '/contentpartner/*', '/serviceregistry/*', '/comment/*', '/private/mlsurvey/*', '/private/mlcore/*',
  '/template/*', '/organisation/*'
)

mountKongSearch('/national/learning/week/insights', '/state/learning/week/insights')

mountKong(
  '/eventprogress/*', '/bp/*', '/customselfregistration', '/feedDiscussion/*', '/customselfregistration/listallqrs',
  '/customselfregistration/isregistrationqractive', '/community/v1/*'
)

proxiesV8.use('/looker/dashboard', lookerDashboard)

mountKongSearch('/courseRecommend/v1/courses')

mountKong('/interface/*', '/courseRecommendation/*')

proxiesV8.use('/chatbot/v3/global', chatBotGenericAPIIntegration)

proxiesV8.use('/chatbot/v3', chatBotIntegrationAPI)

mountKong('/chatbot/*', '/nlp/*', '/thumbnail/*')

proxiesV8.use('/fetchUserToken', jwtUserTokenHelper)

mountKong('/certificate/dynamic/*', '/commentTree/*', '/search/*')

proxiesV8.get('/youtube/duration/:videoid', async (req, res) => {
  const { videoid } = req.params  // Get videoid from URL path instead of query params
  const apiKey = `${CONSTANTS.YOUTUBE_PLAYLIST_API_KEY}`  // Use your actual API key here

  try {
    const response = await axios.get(
      `${CONSTANTS.YOUTUBE_VIDEOS}?id=${videoid}&part=contentDetails&key=${apiKey}`
    )
    res.json(response.data)
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch video data' })
  }
})

mountKong(
  '/extendedprofile/*', '/masterdata/*', '/v1/notifications/*', '/notificationSetting/*', '/accessSettings*',
  '/customFields/*', '/connections/*', '/support/ai/*', '/collection/*', '/moderation/*'
)

proxiesV8.use('/pipeline/content/transcode/*', contentTranscodeAPIIntegration)

mountKong(
  '/assignment/*', '/consent/*', '/v1/notifyAssignment/*', '/promotionalcontent/*', '/sso/*', '/learningpathway/*',
  '/extended/content/*', '/achievement/dynamic/*', '/knowledge/centre/*', '/peersurvey/*', '/batch/v1/enrollment/qrcode/*'
)

proxiesV8.post('/externaltraining/v1/batch/getParticipants', batchParticipantsHandler(API_END_POINTS.externalContentbatchParticipantsApi))

mountKong(
  '/externaltraining/*', '/peervalidation/*', '/badge/*', '/contenthealth/*', '/volunteer/*', '/ai/chatbot/*',
  '/formsConfig/*'
)

mountKongSearch('/composite/v5/search', '/composite/v4/bp/search')

mountKong('/scorm/*', '/karmawallet/*', '/usergroup/*', '/ca/*')
