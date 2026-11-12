jest.mock('../../../src/utils/redis', () => ({
  redis: {
    get: jest.fn(),
  },
}))

import { CONSTANTS } from '../../../src/utils/env'
import {
  campaignMicrositeConfigHandler,
  clearCampaignMicrositeConfigCache,
  getCampaignMicrositeConfig,
  refreshCampaignMicrositeConfigHandler,
} from '../../../src/utils/campaignMicrositeConfig'
import { redis } from '../../../src/utils/redis'

const mockedRedis = redis as unknown as { get: jest.Mock }

// tslint:disable-next-line: no-any
function buildRes() {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.type = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  res.send = jest.fn().mockReturnValue(res)
  return res
}

// tslint:disable-next-line: no-any
function buildReq(remoteAddress: string): any {
  return { socket: { remoteAddress } }
}

const PORTAL_JSON = '{"title":"Sankalp 2026","banner":"portal.png"}'
const MOBILE_JSON = '{"title":"Sankalp 2026","banner":"mobile.png"}'

beforeEach(() => {
  clearCampaignMicrositeConfigCache()
  mockedRedis.get.mockReset()
})

describe('getCampaignMicrositeConfig', () => {
  it('reads from redis on a cache miss and serves from memory afterwards', async () => {
    mockedRedis.get.mockResolvedValue(PORTAL_JSON)

    expect(await getCampaignMicrositeConfig('portal')).toBe(PORTAL_JSON)
    expect(await getCampaignMicrositeConfig('portal')).toBe(PORTAL_JSON)

    expect(mockedRedis.get).toHaveBeenCalledTimes(1)
    expect(mockedRedis.get).toHaveBeenCalledWith(CONSTANTS.CAMPAIGN_PORTAL_REDIS_KEY)
  })

  it('uses the mobile redis key for mobile', async () => {
    mockedRedis.get.mockResolvedValue(MOBILE_JSON)
    expect(await getCampaignMicrositeConfig('mobile')).toBe(MOBILE_JSON)
    expect(mockedRedis.get).toHaveBeenCalledWith(CONSTANTS.CAMPAIGN_MOBILE_REDIS_KEY)
  })

  it('does not cache a missing value', async () => {
    mockedRedis.get.mockResolvedValue(null)
    expect(await getCampaignMicrositeConfig('portal')).toBeNull()
    expect(await getCampaignMicrositeConfig('portal')).toBeNull()
    expect(mockedRedis.get).toHaveBeenCalledTimes(2)
  })
})

describe('campaignMicrositeConfigHandler', () => {
  it('returns the redis JSON content verbatim', async () => {
    mockedRedis.get.mockResolvedValue(PORTAL_JSON)
    const res = buildRes()
    await campaignMicrositeConfigHandler('portal', res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.type).toHaveBeenCalledWith('application/json')
    expect(res.send).toHaveBeenCalledWith(PORTAL_JSON)
  })

  it('returns 404 when the key is absent in redis', async () => {
    mockedRedis.get.mockResolvedValue(null)
    const res = buildRes()
    await campaignMicrositeConfigHandler('mobile', res)
    expect(res.status).toHaveBeenCalledWith(404)
  })

  it('returns 500 when redis fails', async () => {
    mockedRedis.get.mockRejectedValue(new Error('redis down'))
    const res = buildRes()
    await campaignMicrositeConfigHandler('portal', res)
    expect(res.status).toHaveBeenCalledWith(500)
  })
})

describe('refreshCampaignMicrositeConfigHandler', () => {
  it('rejects calls that are not from loopback', async () => {
    const res = buildRes()
    await refreshCampaignMicrositeConfigHandler(buildReq('10.0.0.5'), res)
    expect(res.status).toHaveBeenCalledWith(403)
    expect(mockedRedis.get).not.toHaveBeenCalled()
  })

  it('reloads both keys from redis and replaces the in-memory copy', async () => {
    mockedRedis.get.mockResolvedValue('{"v":1}')
    expect(await getCampaignMicrositeConfig('portal')).toBe('{"v":1}')

    mockedRedis.get.mockImplementation((key: string) =>
      Promise.resolve(key === CONSTANTS.CAMPAIGN_PORTAL_REDIS_KEY ? PORTAL_JSON : MOBILE_JSON))
    const res = buildRes()
    await refreshCampaignMicrositeConfigHandler(buildReq('127.0.0.1'), res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ loaded: { mobile: true, portal: true } }))

    mockedRedis.get.mockClear()
    expect(await getCampaignMicrositeConfig('portal')).toBe(PORTAL_JSON)
    expect(await getCampaignMicrositeConfig('mobile')).toBe(MOBILE_JSON)
    expect(mockedRedis.get).not.toHaveBeenCalled()
  })

  it('accepts IPv6 loopback', async () => {
    mockedRedis.get.mockResolvedValue(null)
    const res = buildRes()
    await refreshCampaignMicrositeConfigHandler(buildReq('::1'), res)
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ loaded: { mobile: false, portal: false } }))
  })
})
