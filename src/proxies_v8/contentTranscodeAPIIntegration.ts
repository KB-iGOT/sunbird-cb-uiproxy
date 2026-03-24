import axios from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logDebug, logError } from '../utils/logger'
import { jsonParser } from '../utils/shared'

export const contentTranscodeAPIIntegration = express.Router()

contentTranscodeAPIIntegration.use('/*', jsonParser, async (req: express.Request, res: express.Response) => {
  try {
    const baseUrl = removePrefix('/proxies/v8/', req.originalUrl)
    logDebug(`The url is... ${baseUrl} : originalUrl: ${req.originalUrl}`)
    const subPath = baseUrl.replace(/^\/+/, '')
    const url = `${CONSTANTS.KONG_API_BASE}/${subPath}`
    const requestBody = req.body

    const axiosConfig = {
      headers: {
        Authorization: CONSTANTS.SB_API_KEY,
        'Content-Type': 'application/json',
        ...req.headers,
      },
      validateStatus: () => true,
      ...axiosRequestConfig,
    }

    let response
    if (req.method === 'GET') {
      response = await axios.get(url, axiosConfig)
    } else if (req.method === 'POST') {
      response = await axios.post(url, requestBody, axiosConfig)
    } else if (req.method === 'PUT') {
      response = await axios.put(url, requestBody, axiosConfig)
    } else if (req.method === 'DELETE') {
      response = await axios.delete(url, axiosConfig)
    } else {
      return res.status(405).send({ error: `Method ${req.method} not supported` })
    }

    res.set(response.headers)
    return res.status(response.status).send(response.data)

  } catch (error) {
    if (error.response) {
      logError(`KONG error response: ${error.response.status}`, error.response.data)
      res.set(error.response.headers)
      return res.status(error.response.status).send(error.response.data)
    }

    logError(`Network/Unknown error in contentTranscodeAPIIntegration`, error.message)
    return res.status(502).send({ error: 'Bad Gateway: Could not reach KONG API' })
  }
})

function removePrefix(prefix: string, s: string): string {
  return s.startsWith(prefix) ? s.substring(prefix.length) : s
}