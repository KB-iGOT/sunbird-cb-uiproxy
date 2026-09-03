import http from 'http'
import https from 'https'
import {
  axiosRequestConfig,
  axiosRequestConfigLong,
  axiosRequestConfigVeryLong,
  sharedHttpAgent,
  sharedHttpsAgent,
} from './request.config'

describe('shared keep-alive agents', () => {
  it('builds a keep-alive http and https agent', () => {
    expect(sharedHttpAgent).toBeInstanceOf(http.Agent)
    expect((sharedHttpAgent as unknown as { keepAlive: boolean }).keepAlive).toBe(true)
    expect(sharedHttpsAgent).toBeInstanceOf(https.Agent)
    expect((sharedHttpsAgent as unknown as { keepAlive: boolean }).keepAlive).toBe(true)
  })
})

describe('axiosRequestConfig', () => {
  it('wires the shared agents into every timeout tier', () => {
    const tiers = [axiosRequestConfig, axiosRequestConfigLong, axiosRequestConfigVeryLong]
    tiers.forEach((cfg) => {
      expect(cfg.httpAgent).toBe(sharedHttpAgent)
      expect(cfg.httpsAgent).toBe(sharedHttpsAgent)
    })
  })

  it('escalates timeout and retry budget across the three tiers', () => {
    expect(axiosRequestConfig.retry).toBe(0)
    expect(axiosRequestConfigLong.retry).toBe(3)
    expect(axiosRequestConfigVeryLong.retry).toBe(1)

    expect(axiosRequestConfigLong.timeout).toBeGreaterThan(axiosRequestConfig.timeout as number)
    expect(axiosRequestConfigVeryLong.timeout).toBeGreaterThan(axiosRequestConfigLong.timeout as number)
  })
})
