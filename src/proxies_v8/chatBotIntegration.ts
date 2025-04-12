import axios from 'axios'
import express from 'express'
import { axiosRequestConfig } from '../configs/request.config'
import { CONSTANTS } from '../utils/env'
import { logError} from '../utils/logger'
export const chatBotIntegrationAPI = express.Router()

chatBotIntegrationAPI.use('/*', async (req, res) => {
    try {
        const url = CONSTANTS.APP_FUEL_API_URL
        const requestBody = req.body

        const response = await axios.post(url, requestBody, {
            headers: {
                'Content-Type': 'application/json',
            },
            ...axiosRequestConfig,
        })

        res.status(response.status).send(response.data)
    } catch (error) {
        logError('Error in chatBotIntegrationAPI /search', error)
        res.status(500).send({ error: 'Failed to fetch data from chatbot API' })
    }
})
