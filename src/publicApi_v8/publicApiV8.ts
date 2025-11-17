import axios from 'axios'
import express, { Request } from 'express'
import express, { Request } from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError } from '../utils/logger'
import { proxyCreatorRoute } from '../utils/proxyCreator'
import { parichayAuth } from './parichayAuth'
import { workallocationPublic } from './workallocationPublic'
import { youtubePlaylist } from './youtubePlaylist'

const puppeteer = require('puppeteer')
export const publicApiV8 = express.Router()

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

publicApiV8.use('/assets',
  proxyCreatorRoute(express.Router(), CONSTANTS.WEB_HOST_PROXY + '/web-hosted/web-client-public-assets'))

publicApiV8.use('/workallocation', workallocationPublic)

publicApiV8.use('/org/v1/list', proxyCreatorRoute(express.Router(), CONSTANTS.KONG_API_BASE + '/org/v1/list'))

publicApiV8.use('/parichay', parichayAuth)

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
      sort_by : {
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
    res.status(500).send('Internal Server Error')
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
        additionalTags : ['Public Course'],
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
    res.status(500).send('Internal Server Error')
  }
}
