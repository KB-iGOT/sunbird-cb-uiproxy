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
        return res.status(response.status).send(response.data)
    } catch (error) {
        logError(`Error in chatBotIntegrationAPI`, error)
        return res.status(500).send({ error: 'Failed to fetch data from chatbot API' })
    }
})

function removePrefix(prefix: string, s: string): string {
  return s.startsWith(prefix) ? s.substring(prefix.length) : s
}
