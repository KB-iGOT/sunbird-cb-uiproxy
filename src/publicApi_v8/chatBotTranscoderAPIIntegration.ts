import axios from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logDebug, logError } from '../utils/logger'
import { ERROR } from '../utils/message'
import { extractUserTokenFromRequest } from '../utils/requestExtract'
import { jsonParser } from '../utils/shared'

const ACCEPT_ENCODING = 'accept-encoding'
const CONTENT_ENCODING = 'content-encoding'

export const chatBotTranscoderAPIIntegration = express.Router()

chatBotTranscoderAPIIntegration.use('/*', jsonParser, async (req: express.Request, res: express.Response) => {
  try {

    if (!req.headers.authorization) {
      res.status(400).send(ERROR.ERROR_NO_AUTHORIZATION)
      return
    }

    if (!extractUserTokenFromRequest(req)) {
      res.status(400).send(ERROR.ERROR_NO_USER_TOKEN)
      return
    }

    const baseUrl = removePrefix('/public/v8/chatbot/v3/mobile/transcoder', req.originalUrl)
    logDebug(`The url is... ${baseUrl} : originalUrl: ${req.originalUrl}`)
    const subPath = baseUrl.replace(/^\/+/, '')
    const url = `${CONSTANTS.APP_FUEL_API_URL}/transcoder/${subPath}`
    const requestBody = req.body
    logDebug(`Chatbot Transcoder API Request -> URL: ${url}`)

    // Remove 'br' from request headers
    const requestHeaders = { ...req.headers }
    if (requestHeaders[ACCEPT_ENCODING]) {
      requestHeaders[ACCEPT_ENCODING] = String(requestHeaders[ACCEPT_ENCODING])
        .split(',')
        .map((enc) => enc.trim())
        .filter((enc) => enc !== 'br')
        .join(', ')
    }
    if (requestHeaders[CONTENT_ENCODING]) {
      requestHeaders[CONTENT_ENCODING] = String(requestHeaders[CONTENT_ENCODING])
        .split(',')
        .map((enc) => enc.trim())
        .filter((enc) => enc !== 'br')
        .join(', ')
    }

    const axiosConfig = {
      headers: {
        'Content-Type': 'application/json',
        ...(req.headers.authorization && { Authorization: req.headers.authorization }),
        ...(extractUserTokenFromRequest(req) && { 'x-authenticated-user-token': extractUserTokenFromRequest(req) }),
        ...requestHeaders,
      },
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

    // Remove 'br' from response headers
    const responseHeaders = { ...response.headers }
    if (responseHeaders[CONTENT_ENCODING]) {
      responseHeaders[CONTENT_ENCODING] = String(responseHeaders[CONTENT_ENCODING])
        .split(',')
        .map((enc) => enc.trim())
        .filter((enc) => enc !== 'br')
        .join(', ')
    }
    if (responseHeaders[ACCEPT_ENCODING]) {
      responseHeaders[ACCEPT_ENCODING] = String(responseHeaders[ACCEPT_ENCODING])
        .split(',')
        .map((enc) => enc.trim())
        .filter((enc) => enc !== 'br')
        .join(', ')
    }

    // Set filtered headers to response
    Object.keys(responseHeaders).forEach((key) => {
      if (responseHeaders[key]) {
        res.setHeader(key, responseHeaders[key])
      }
    })

    return res.status(response.status).send(response.data)
  } catch (error) {
    logError(`Error in chatBotTranscoderAPIIntegration: ${String(error)}`)
    return res.status(500).send({ error: 'Failed to fetch data from chatbot transcoder API' })
  }
})

function removePrefix(prefix: string, s: string): string {
  return s.startsWith(prefix) ? s.substring(prefix.length) : s
}