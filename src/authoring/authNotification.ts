import express from 'express'
import { CONSTANTS } from '../utils/env'
import { createPooledProxy } from '../utils/proxyCreator'

export const authNotification = express.Router()
const proxyCreator = createPooledProxy({ timeout: 10000 })

authNotification.all('*', (req, res) => {
  req.url = req.url.replace('/authNotificationApi', '')
  proxyCreator.web(req, res, {
    target: CONSTANTS.NOTIFICATIONS_API_BASE,
  })
})
