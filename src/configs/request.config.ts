import http from 'http'
import https from 'https'
import { AxiosRequestConfig } from '../models/axios-request-config.model'
import { CONSTANTS } from '../utils/env'

const sharedHttpAgent = new http.Agent({
  keepAlive: true,
  maxFreeSockets: CONSTANTS.UPSTREAM_MAX_IDLE_CONNECTIONS,
  maxSockets: CONSTANTS.UPSTREAM_MAX_CONNECTIONS,
  timeout: CONSTANTS.UPSTREAM_KEEPALIVE_TIMEOUT,
})

const sharedHttpsAgent = new https.Agent({
  keepAlive: true,
  maxFreeSockets: CONSTANTS.UPSTREAM_MAX_IDLE_CONNECTIONS,
  maxSockets: CONSTANTS.UPSTREAM_MAX_CONNECTIONS,
  timeout: CONSTANTS.UPSTREAM_KEEPALIVE_TIMEOUT,
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
