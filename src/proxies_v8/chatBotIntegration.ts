import axios from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

export const chatBotIntegrationAPI = express.Router()

chatBotIntegrationAPI.use('/*', async (req: express.Request, res: express.Response) => {
    try {

        const baseUrl = removePrefix('/proxies/v8/chatbot/v3', req.originalUrl)
        logInfo(`The url is... ${baseUrl} : originalUrl: ${req.originalUrl}`)
        const subPath = baseUrl.replace(/^\/+/, '')
        const url = `${CONSTANTS.APP_FUEL_API_URL}/${subPath}`
        const requestBody = req.body
        logInfo(`Chatbot API Request -> URL: ${url}`)
        const axiosConfig = {
            headers: {
                'Content-Type': 'application/json',
            },
            ...axiosRequestConfig,
        }

        const response = await axios.post(url, requestBody, axiosConfig)
        res.status(response.status).send(response.data)
    } catch (error) {
        logError(`Error in chatBotIntegrationAPI`, error)
        res.status(500).send({ error: 'Failed to fetch data from chatbot API' })
    }
})

function removePrefix(prefix: string, s: string): string {
  return s.startsWith(prefix) ? s.substring(prefix.length) : s
}
