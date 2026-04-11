import axios from 'axios'
import express, { Request } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logDebug, logError } from '../utils/logger'
import { PERMISSION_HELPER } from '../utils/permissionHelper'
import { proxyCreatorRoute } from '../utils/proxyCreator'
import { redis } from '../utils/redis'
import { chatBotTranscoderAPIIntegration } from './chatBotTranscoderAPIIntegration'
import { ntpcAuth } from './ntpcAuth'
import { oilAuth } from './oilAuth'
import { parichayAuth } from './parichayAuth'
import { workallocationPublic } from './workallocationPublic'
import { youtubePlaylist } from './youtubePlaylist'

const puppeteer = require('puppeteer')
export const publicApiV8 = express.Router()

const MAX_CONCURRENT_PDF_RENDERS = Number(process.env.MAX_CONCURRENT_PDF_RENDERS) || 5
const PAGE_TIMEOUT = Number(process.env.PAGE_TIMEOUT) || 30000
const QUEUE_TIMEOUT = Number(process.env.QUEUE_TIMEOUT) || 60000

let activePdfRenders = 0
// tslint:disable-next-line: no-any
const pdfWaitQueue: Array<{ resolve: () => void; timer: ReturnType<typeof setTimeout> }> = []

function acquirePdfSlot(): Promise<void> {
  if (activePdfRenders < MAX_CONCURRENT_PDF_RENDERS) {
    activePdfRenders++
    return Promise.resolve()
  }
  return new Promise<void>((resolve, reject) => {
    // tslint:disable-next-line: no-any
    const entry: { resolve: () => void; timer: any } = { resolve, timer: null }
    entry.timer = setTimeout(() => {
      const idx = pdfWaitQueue.indexOf(entry)
      if (idx !== -1) { pdfWaitQueue.splice(idx, 1) }
      reject(new Error('PDF render queue timeout - service is overloaded'))
    }, QUEUE_TIMEOUT)
    pdfWaitQueue.push(entry)
  })
}

function releasePdfSlot(): void {
  if (pdfWaitQueue.length > 0) {
    const next = pdfWaitQueue.shift()!
    clearTimeout(next.timer)
    next.resolve()
  } else {
    activePdfRenders = Math.max(0, activePdfRenders - 1)
  }
}

const API_END_POINTS = {
  designationSearch: `${CONSTANTS.KONG_API_BASE}/designation/search`,
  kongCompositeSearch: `${CONSTANTS.KONG_API_BASE}/composite/v4/search`,
  publicAssessmentV1QuestionList: `${CONSTANTS.KONG_API_BASE}/public/assessment/v1/question/list`,
  publicAssessmentV1Read: `${CONSTANTS.KONG_API_BASE}/public/assessment/v1/read/:id`,
  publicAssessmentV4Submit: `${CONSTANTS.KONG_API_BASE}/public/assessment/v4/assessment/submit`,
  publicAssessmentV5QuestionList: `${CONSTANTS.KONG_API_BASE}/public/assessment/v5/question/list`,
  publicAssessmentV5Read: `${CONSTANTS.KONG_API_BASE}/public/assessment/v5/read`,
  publicAssessmentV5Result: `${CONSTANTS.KONG_API_BASE}/public/assessment/v5/result`,
  publicAssessmentV5Submit: `${CONSTANTS.KONG_API_BASE}/public/assessment/v5/assessment/submit`,
  publicAssessmentV7Result: `${CONSTANTS.KONG_API_BASE}/public/assessment/v7/result`,
  publicFormSubmit: `${CONSTANTS.KONG_API_BASE}/public/forms/v2/saveFormSubmit`,
  publicGetApplicationsById: `${CONSTANTS.KONG_API_BASE}/forms/v2/getApplicationsById`,
  publicGetFormById: `${CONSTANTS.KONG_API_BASE}/public/forms/v2/getFormById`,
  publicOrgHierarchyMinistrySearch: `${CONSTANTS.KONG_API_BASE}/org/hierarchy/ministry/search`,
  publicOrgHierarchySearch: `${CONSTANTS.KONG_API_BASE}/org/hierarchy/search`,
  publicOrgHierarchyStateSearch: `${CONSTANTS.KONG_API_BASE}/org/hierarchy/state/search`,
}

publicApiV8.get('/', (_req, res) => {
  res.json({
    status: `Public Api is working fine https base: ${CONSTANTS.HTTPS_HOST}`,
  })
})

publicApiV8.get('/systemDate', (_req, res) => {
  res.json({
    systemDate: new Date().getTime(),
  })
})

publicApiV8.post('/course/batch/cert/download/mobile', async (req, res) => {
  try {
    const svgContent = req.body.printUri
    if (req.body.outputFormat === 'svg') {
      const _decodedSvg = decodeURIComponent(svgContent.replace(/data:image\/svg\+xml,/, '')).replace(/\<!--\s*[a-zA-Z0-9\-]*\s*--\>/g, '')
      res.type('html')
      res.status(200).send(_decodedSvg)
    } else if (req.body.outputFormat === 'pdf') {
      const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
      const page = await browser.newPage()
      await page.goto(svgContent, { waitUntil: 'networkidle2' })
      const buffer = await page.pdf({ path: 'certificate.pdf', printBackground: true, width: '1204px', height: '662px' })
      res.set({ 'Content-Type': 'application/pdf', 'Content-Length': buffer.length })
      res.send(buffer)
      browser.close()
    } else {
      res.status(400).json({
        error: 'Unsupported output format',
        msg: 'Output format should be svg or pdf',
      })
    }
  } catch (err) {
    logError(err)

    res.status((err && err.response && err.response.status) || 500).send(
      (err && err.response && err.response.data) || {
        error: 'Failed due to unknown reason',
      }
    )
  }
})

publicApiV8.post('/nlw/2026/cert/download/mobile', async (req, res) => {
  logDebug('[SadhanaSaptha] POST /nlw/2026/cert/download/mobile received at', new Date().toString())
  // tslint:disable-next-line: no-any
  const reqObj = req as any

  if (!CONSTANTS.IS_DEVELOPMENT && (!reqObj.session || !reqObj.session.userId || !reqObj.kauth || !reqObj.kauth.grant)) {
    logDebug('[SadhanaSaptha] Unauthorized - session or kauth missing. session:',
      JSON.stringify(reqObj.session), 'kauth:', JSON.stringify(reqObj.kauth))
    res.status(401).json({ error: 'Unauthorized', msg: 'User session not found' })
    return
  }

  logDebug('[SadhanaSaptha] Session valid for userId:', reqObj.session && reqObj.session.userId)

  // Wrap callback-based permission check in a Promise for clean async/await flow
  // tslint:disable-next-line: no-any
  const checkPermission = (): Promise<void> => new Promise((resolve, reject) => {
    if (CONSTANTS.IS_DEVELOPMENT) {
      logDebug('[SadhanaSaptha] Skipping permission check in development mode')
      return resolve()
    }
    // tslint:disable-next-line: no-any
    PERMISSION_HELPER.isUserAbleToDownloadSadhanaSapthaCert(reqObj, (err: any) => {
      if (err) {
        reject(err)
      } else {
        resolve()
      }
    })
  })

  try {
    await checkPermission()

    const svgContent = req.body.printUri
    const fullName = (reqObj.session && reqObj.session.firstName) || ''
    const userName = fullName.trim()

    // Decode SVG and apply name substitution once — applies to all output formats
    const decodedSvg = decodeURIComponent(svgContent.replace(/data:image\/svg\+xml,/, ''))
      .replace(/<!--\s*[a-zA-Z0-9\-]*\s*-->/g, '')
      .replace(/\$\{Recepient Name\}/g, userName)

    if (req.body.outputFormat === 'svg') {
      res.type('html')
      return res.status(200).send(decodedSvg)
    }

    if (req.body.outputFormat !== 'pdf') {
      return res.status(400).json({ error: 'Unsupported output format', msg: 'Output format should be svg or pdf' })
    }

    await acquirePdfSlot()
    let browser = null
    let page = null
    try {
      browser = await puppeteer.launch({
        args: [
          '--disable-dev-shm-usage',
          '--disable-extensions',
          '--disable-gpu',
          '--disable-setuid-sandbox',
          '--no-first-run',
          '--no-sandbox',
        ],
        headless: true,
      })
      page = await browser.newPage()
      await page.setContent(decodedSvg, { waitUntil: 'networkidle2', timeout: PAGE_TIMEOUT })
      const buffer = await page.pdf({ printBackground: true, width: '1204px', height: '662px' })
      res.set({ 'Content-Type': 'application/pdf', 'Content-Length': buffer.length })
      res.send(buffer)
      return
    } finally {
      if (page) {
        try {
          await page.close()
        } catch (_e) {
          // ignore close errors
        }
      }
      if (browser) {
        try {
          await browser.close()
        } catch (_e) {
          // ignore close errors
        }
      }
      releasePdfSlot()
    }
  } catch (err) {
    logError(err)
    if (err.message && err.message.includes('queue timeout')) {
      return res.status(503).json({ error: 'Service is overloaded, please retry later' })
    }
    if (err.message && err.message.includes('eligible')) {
      return res.status(403).json({ error: 'Forbidden', msg: 'User is not eligible to download certificate' })
    }
    return res.status(500).json({ error: 'Failed due to unknown reason' })
  }
})

publicApiV8.use('/assets',
  proxyCreatorRoute(express.Router(), CONSTANTS.WEB_HOST_PROXY + '/web-hosted/web-client-public-assets'))

publicApiV8.use('/workallocation', workallocationPublic)

publicApiV8.use('/org/v1/list', proxyCreatorRoute(express.Router(), CONSTANTS.KONG_API_BASE + '/org/v1/list'))

publicApiV8.use('/parichay', parichayAuth)

publicApiV8.use('/oil', oilAuth)

publicApiV8.use('/ntpc', ntpcAuth)

publicApiV8.use('/halloffame/read', proxyCreatorRoute(express.Router(), CONSTANTS.KONG_API_BASE + '/halloffame/read'))

publicApiV8.use('/walloffame/read', proxyCreatorRoute(express.Router(), CONSTANTS.KONG_API_BASE + '/walloffame/read'))

publicApiV8.use('/playlist', youtubePlaylist)

publicApiV8.use('/public/assessment/v1/question/list', proxyCreatorRoute(express.Router(), API_END_POINTS.publicAssessmentV1QuestionList))

publicApiV8.use('/public/assessment/v1/read/:id', proxyCreatorRoute(express.Router(), API_END_POINTS.publicAssessmentV1Read))

publicApiV8.use('/public/assessment/v5/question/list', proxyCreatorRoute(express.Router(), API_END_POINTS.publicAssessmentV5QuestionList))

publicApiV8.use('/public/assessment/v5/read', proxyCreatorRoute(express.Router(), API_END_POINTS.publicAssessmentV5Read))

publicApiV8.use('/public/assessment/v5/assessment/submit', proxyCreatorRoute(express.Router(), API_END_POINTS.publicAssessmentV5Submit))

publicApiV8.use('/public/assessment/v4/assessment/submit', proxyCreatorRoute(express.Router(), API_END_POINTS.publicAssessmentV4Submit))

publicApiV8.use('/public/assessment/v5/result', proxyCreatorRoute(express.Router(), API_END_POINTS.publicAssessmentV5Result))

publicApiV8.use('/public/assessment/v7/result', proxyCreatorRoute(express.Router(), API_END_POINTS.publicAssessmentV7Result))

publicApiV8.use('/org/v1/read', proxyCreatorRoute(express.Router(), CONSTANTS.KONG_API_BASE + '/org/v1/read'))

publicApiV8.use('/public/forms/v2/getFormById', proxyCreatorRoute(express.Router(), API_END_POINTS.publicGetFormById))

publicApiV8.use('/forms/v2/getApplicationsById', proxyCreatorRoute(express.Router(), API_END_POINTS.publicGetApplicationsById))

publicApiV8.use('/chatbot/v3/mobile/transcoder', chatBotTranscoderAPIIntegration)

publicApiV8.post('/public/forms/v2/saveFormSubmit', async (req: Request, res: express.Response) => {
  try {
    const response = await axios.post(API_END_POINTS.publicFormSubmit, req.body, {
      ...axiosRequestConfig,
      headers: {
        ...req.headers,
        Authorization: CONSTANTS.SB_API_KEY,
      },
    })
    const resCode = response.data.responseCode
    if (!resCode || resCode.toLowerCase() !== 'ok') {
      res.status(400).send(response.data)
    } else {
      res.status(200).send(response.data)
    }
  } catch (error) {
    logError(`Failed to submit form. Error: ${error}`)
    res.status(500).send(CONSTANTS.INTERNAL_SERVER_ERR_MSG)
  }
})

publicApiV8.get('/careers/list', async (_, res) => {
  await fetchList('Jobs', res)
})

publicApiV8.get('/tenders/list', async (_, res) => {
  await fetchList('Tenders', res)
})

const fetchList = async (resourceCategoryString: string, res: express.Response) => {
  const reqBody = {
    request: {
      facets: ['name', 'source', 'position'],
      filters: {
        resourceCategory: resourceCategoryString,
        status: ['Live'],
      },
      limit: 500,
      offset: 0,
      sort_by: {
        lastUpdatedOn: 'desc',
      },
    },
  }
  try {
    const response = await axios.post(API_END_POINTS.kongCompositeSearch, reqBody, {
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
    })
    const resCode = response.data.responseCode
    if (!resCode || resCode.toLowerCase() !== 'ok') {
      res.status(400).send(response.data)
    } else {
      res.status(200).send(response.data)
    }
  } catch (error) {
    logError(`Failed to get ${resourceCategoryString} listing. Error: ${error}`)
    res.status(500).send(CONSTANTS.INTERNAL_SERVER_ERR_MSG)
  }
}

publicApiV8.use('/org/v2/list', proxyCreatorRoute(express.Router(), CONSTANTS.KONG_API_BASE + '/org/v2/list'))
publicApiV8.use('/liveness', (_req, res) => {
  res.status(200).send('ok')
})

publicApiV8.post('/designation/search', async (req, res) => {
  const { searchString } = req.body
  let { pageSize, pageNumber, requestedFields } = req.body

  // ---- 0. Apply defaults if missing ----
  pageNumber = Number(pageNumber !== undefined && pageNumber !== null ? pageNumber : 0)
  pageSize = Number(pageSize !== undefined && pageSize !== null ? pageSize : 20)
  // ---- Ensure requestedFields is always an array ----
  if (!Array.isArray(requestedFields)) {
    requestedFields = []
  }

  // ---- 1. Validate searchString ONLY IF PROVIDED ----
  if (searchString !== undefined && searchString !== null && searchString !== '') {

    if (typeof searchString !== CONSTANTS.STRING_TYPE) {
      return res.status(400).json({
        message: CONSTANTS.SEARCH_STRING_TYPE_ERR_MSG,
      })
    }

    if (searchString.length < 2 || searchString.length > 50) {
      return res.status(400).json({
        message: CONSTANTS.SEARCH_STRING_LENGTH_ERR_MSG,
      })
    }

    const searchQueryStringRegex = new RegExp(CONSTANTS.SEARCH_QUERY_STRING_REGEX, 'i')
    if (searchQueryStringRegex.test(searchString)) {
      return res.status(400).json({
        message: CONSTANTS.SEARCH_STRING_INVALID_CHAR_ERR_MSG,
      })
    }
  }

  // ---- 2. Validate pageSize (1–100) ----
  if (isNaN(pageSize) || pageSize < 1 || pageSize > 100) {
    return res.status(400).json({
      message: CONSTANTS.PAGE_SIZE_ERR_MSG,
    })
  }

  // ---- 3. Validate pageNumber (0–10000) ----
  if (isNaN(pageNumber) || pageNumber < 0 || pageNumber > 10000) {
    return res.status(400).json({
      message: CONSTANTS.PAGE_NUMBER_ERR_MSG,
    })
  }

  // ----4. Set normalized values back into req.body ----
  req.body.pageNumber = pageNumber
  req.body.pageSize = pageSize
  req.body.requestedFields = requestedFields

  return publicDesignationSearch(req, res)
})

const publicDesignationSearch = async (req: Request, res: express.Response) => {
  const reqBody = {
    filterCriteriaMap: {
      status: CONSTANTS.ACTIVE,
    },
    pageNumber: req.body.pageNumber,
    pageSize: req.body.pageSize,
    requestedFields: req.body.requestedFields,
    searchString: req.body.searchString,
  }
  try {
    const response = await axios.post(API_END_POINTS.designationSearch, reqBody, {
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
    })
    const resCode = response.data.responseCode
    if (!resCode || resCode.toLowerCase() !== 'ok') {
      res.status(400).send(response.data)
    } else {
      res.status(200).send(response.data)
    }
  } catch (error) {
    logError(`Failed to get designation list. Error: ${error}`)
    res.status(500).send(CONSTANTS.INTERNAL_SERVER_ERR_MSG)
  }
}

publicApiV8.post('/public/content/search', async (req, res) => {
  await fetchContentDetailsList('Case Study', req, res)
})

const fetchContentDetailsList = async (resourceCategoryString: string, req: Request, res: express.Response) => {
  const reqBody = {
    request: {
      facets: ['courseCategory', 'resourceCategory'],
      filters: {
        additionalTags: ['Public Course'],
        courseCategory: resourceCategoryString,
        resourceCategory: resourceCategoryString,
        status: ['Live'],
      },
      limit: req.body.request.limit,
      offset: req.body.request.offset,
      sort_by: {
        lastUpdatedOn: 'desc',
      },
    },
  }
  try {
    const response = await axios.post(API_END_POINTS.kongCompositeSearch, reqBody, {
      ...axiosRequestConfig,
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
      },
    })
    const resCode = response.data.responseCode
    if (!resCode || resCode.toLowerCase() !== 'ok') {
      res.status(400).send(response.data)
    } else {
      res.status(200).send(response.data)
    }
  } catch (error) {
    logError(`Failed to get ${resourceCategoryString} listing. Error: ${error}`)
    res.status(500).send(CONSTANTS.INTERNAL_SERVER_ERR_MSG)
  }
}

publicApiV8.post('/org/hierarchy/search', async (req: Request, res: express.Response) => {
  try {
    const response = await axios.post(API_END_POINTS.publicOrgHierarchySearch, req.body, {
      ...axiosRequestConfig,
      headers: {
        ...req.headers,
      },
    })
    const resCode = response.data.responseCode
    if (!resCode || resCode.toLowerCase() !== 'ok') {
      res.status(400).send(response.data)
    } else {
      res.status(200).send(response.data)
    }
  } catch (error) {
    logError(`Failed to get the hierarchy search Response. Error: ${error}`)
    res.status(500).send(CONSTANTS.INTERNAL_SERVER_ERR_MSG)
  }
})

publicApiV8.post('/org/hierarchy/ministry/search', async (req: Request, res: express.Response) => {
  try {
    const response = await axios.post(API_END_POINTS.publicOrgHierarchyMinistrySearch, req.body, {
      ...axiosRequestConfig,
      headers: {
        ...req.headers,
      },
    })
    const resCode = response.data.responseCode
    if (!resCode || resCode.toLowerCase() !== 'ok') {
      res.status(400).send(response.data)
    } else {
      res.status(200).send(response.data)
    }
  } catch (error) {
    logError(`Failed to get the hierarchy search Response for Ministry. Error: ${error}`)
    res.status(500).send(CONSTANTS.INTERNAL_SERVER_ERR_MSG)
  }
})

publicApiV8.post('/org/hierarchy/state/search', async (req: Request, res: express.Response) => {
  try {
    const response = await axios.post(API_END_POINTS.publicOrgHierarchyStateSearch, req.body, {
      ...axiosRequestConfig,
      headers: {
        ...req.headers,
      },
    })
    const resCode = response.data.responseCode
    if (!resCode || resCode.toLowerCase() !== 'ok') {
      res.status(400).send(response.data)
    } else {
      res.status(200).send(response.data)
    }
  } catch (error) {
    logError(`Failed to get the hierarchy search Response for state. Error: ${error}`)
    res.status(500).send(CONSTANTS.INTERNAL_SERVER_ERR_MSG)
  }
})

publicApiV8.get('/igot/consumption/status', async (_req, res) => {
  try {
    const [
      courses,
      karmayogiOnboarded,
      courseProgramCompletionCount,
      courseProgramCompletionYesterdayCount,
      monthyActiveUsers,
    ] = await Promise.all([
      redis.get('lp_es_live_course_count'),
      redis.get('lp_es_user_count'),
      redis.get('dashboard_completed_count'),
      redis.get('lp_completed_yesterday_count'),
      redis.get('lp_monthly_active_users'),
    ])

    const response = {
      id: 'igot.consumption.stats',
      responseCode: 'OK',
      result: {
        response: {
          courseProgramCompletionCount: courseProgramCompletionCount || '0',
          courseProgramCompletionYesterdayCount: courseProgramCompletionYesterdayCount || '0',
          courses: courses || '0',
          karmayogiOnboarded: karmayogiOnboarded || '0',
          monthyActiveUsers: monthyActiveUsers || '0',
        },
      },
    }

    res.status(200).send(response)
  } catch (error) {
    logError(`Failed to fetch consumption stats. Error: ${error}`)
    res.status(500).send(CONSTANTS.INTERNAL_SERVER_ERR_MSG)
  }
})
