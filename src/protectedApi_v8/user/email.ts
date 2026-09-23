import axios from 'axios'
import { Router } from 'express'
import { axiosRequestConfig } from '../../configs/request.config'
import { CONSTANTS } from '../../utils/env'
import { sendUpstreamError } from '../../utils/errors'

const API_END_POINTS = {
  email: CONSTANTS.SB_EXT_API_BASE + '/v1/Notification/Send',
}

export const emailApi = Router()

emailApi.post('/emailText', async (req, res) => {
  try {
    const response = await axios.post(`${API_END_POINTS.email}/Text`, req.body, axiosRequestConfig)
    res.status(response.status).send(response.data)
  } catch (err) {
    sendUpstreamError(res, err, { error: 'Failed due to unknown reason' })
  }
})
