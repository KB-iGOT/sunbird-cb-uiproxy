import express from 'express'
import { CONSTANTS } from '../utils/env'
import { createPooledProxy } from '../utils/proxyCreator'

export const authBackend = express.Router()
const proxyCreator = createPooledProxy()

authBackend.all('*', (req, res) => {
  req.url = req.url.replace('/authApi', '')
  proxyCreator.web(req, res, {
    target: CONSTANTS.AUTHORING_BACKEND,
  })
})
