import axios from 'axios'
import express from 'express'
import { CONSTANTS } from '../utils/env'
import { AxiosRequestConfig } from './../models/axios-request-config.model'
import { DEFAULT_META } from './constants/default-meta'
export const authSearch = express.Router()

// Route-level body parsing — global parsers removed, each router parses its own.
authSearch.use(express.json({ limit: '50mb' }))
authSearch.use(express.urlencoded({ extended: false, limit: '50mb' }))

authSearch.all('*', (req, res) => {
  const body = {
    ...(req.body || {}),
    sourceFields: DEFAULT_META,
  }
  if (!req.url.includes('/v6/')) {
    delete body.sourceFields
  }
  axios({
    data: body,
    method: req.method,
    url: `${CONSTANTS.SEARCH_API_BASE}${req.url}`,
  } as AxiosRequestConfig)
    .then((response) => {
      res.status(response.status).send(response.data)
    })
    .catch((error) => {
      res.status(error.response.status).send(error.response.data)
    })
})
