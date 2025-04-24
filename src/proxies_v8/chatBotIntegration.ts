import axios from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError, logInfo } from '../utils/logger'

export const chatBotIntegrationAPI = express.Router()

chatBotIntegrationAPI.use('/*', async (req: express.Request, res: express.Response) => {
    try {

        const subPath = req.path.replace(/^\/+/, '')
        const url = `${CONSTANTS.APP_FUEL_API_URL}/${subPath}`
        const requestBody = req.body
        const queryParams = req.query
        logInfo(`Chatbot API Request -> URL: ${url} , reqPath : ${req.path}`)
        logInfo(`Chatbot API Request -> Query Params: ${JSON.stringify(queryParams)}`)
        logInfo(`Chatbot API Request -> Body: ${JSON.stringify(requestBody)}`)
        const axiosConfig = {
            headers: {
                'Content-Type': 'application/json',
            },
            ...axiosRequestConfig,
        }

        // Only include `params` if there are any query parameters
        if (Object.keys(queryParams).length > 0) {
            axiosConfig.params = queryParams
        }

        const response = await axios.post(url, requestBody, axiosConfig)

        res.status(response.status).send(response.data)
    } catch (error) {
        logError(`Error in chatBotIntegrationAPI`, error)
        res.status(500).send({ error: 'Failed to fetch data from chatbot API' })
    }
})
