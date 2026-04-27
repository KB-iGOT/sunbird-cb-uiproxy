import express from 'express'
import { CONSTANTS } from '../utils/env'
import { createPooledProxy } from '../utils/proxyCreator'

export const authIapBackend = express.Router()
const proxyCreator = createPooledProxy()

authIapBackend.all('*', (req, res) => {
  req.url = req.url.replace('/authIapApi', '')
  proxyCreator.web(req, res, {
    changeOrigin: true,
    target: CONSTANTS.IAP_BACKEND_AUTH,
  })
})
