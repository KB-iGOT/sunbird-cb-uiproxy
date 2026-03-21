import http from 'http'
import https from 'https'
import { AxiosRequestConfig } from '../models/axios-request-config.model'
import { CONSTANTS } from '../utils/env'

const sharedHttpAgent = new http.Agent({
  keepAlive: true,
  maxFreeSockets: 10,
  maxSockets: 50,
  timeout: 60000,
})

const sharedHttpsAgent = new https.Agent({
  keepAlive: true,
  maxFreeSockets: 10,
  maxSockets: 50,
  timeout: 60000,
})

export const axiosRequestConfig: AxiosRequestConfig = {
  httpAgent: sharedHttpAgent,
  httpsAgent: sharedHttpsAgent,
  retry: 0,
  retryDelay: 1,
  timeout: Number(CONSTANTS.TIMEOUT) || 10000,
}

export const axiosRequestConfigLong: AxiosRequestConfig = {
  httpAgent: sharedHttpAgent,
  httpsAgent: sharedHttpsAgent,
  retry: 3,
  retryDelay: 1,
  timeout: 20000,
}

export const axiosRequestConfigVeryLong: AxiosRequestConfig = {
  httpAgent: sharedHttpAgent,
  httpsAgent: sharedHttpsAgent,
  retry: 1,
  retryDelay: 1,
  timeout: 200000,
}
