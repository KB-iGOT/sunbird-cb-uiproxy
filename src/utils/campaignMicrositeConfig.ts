import { Request, Response } from 'express'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'
import { redis } from './redis'

export type CampaignConfigKind = 'portal' | 'mobile'

const LOOPBACK_ADDRESSES = ['127.0.0.1', '::1', '::ffff:127.0.0.1']

// In-memory copy of the raw JSON string stored in redis, per kind
const cache: { [kind in CampaignConfigKind]?: string } = {}

function redisKeyFor(kind: CampaignConfigKind): string {
  return kind === 'portal' ? CONSTANTS.CAMPAIGN_PORTAL_REDIS_KEY : CONSTANTS.CAMPAIGN_MOBILE_REDIS_KEY
}

async function loadFromRedis(kind: CampaignConfigKind): Promise<string | null> {
  const value = await redis.get(redisKeyFor(kind))
  if (value) {
    cache[kind] = value
  }
  return value
}

export async function getCampaignMicrositeConfig(kind: CampaignConfigKind): Promise<string | null> {
  const cached = cache[kind]
  if (cached) {
    return cached
  }
  return loadFromRedis(kind)
}

export async function refreshCampaignMicrositeConfig(): Promise<{ [kind in CampaignConfigKind]: boolean }> {
  const [portal, mobile] = await Promise.all([loadFromRedis('portal'), loadFromRedis('mobile')])
  return { portal: Boolean(portal), mobile: Boolean(mobile) }
}

export function clearCampaignMicrositeConfigCache(): void {
  delete cache.portal
  delete cache.mobile
}

export async function campaignMicrositeConfigHandler(kind: CampaignConfigKind, res: Response): Promise<void> {
  try {
    const value = await getCampaignMicrositeConfig(kind)
    if (!value) {
      res.status(404).json({ error: 'not_found', message: `No campaign ${kind} config found in redis` })
      return
    }
    // Return the redis JSON content verbatim
    res.status(200).type('application/json').send(value)
  } catch (err) {
    logError(`Failed to read campaign ${kind} config from redis`, String(err))
    res.status(500).json({ error: 'internal_error', message: CONSTANTS.INTERNAL_SERVER_ERR_MSG })
  }
}

function isLoopbackRequest(req: Request): boolean {
  const address = (req.socket && req.socket.remoteAddress) || ''
  return LOOPBACK_ADDRESSES.includes(address)
}

export async function refreshCampaignMicrositeConfigHandler(req: Request, res: Response): Promise<void> {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: 'forbidden', message: 'This API can only be called from inside the ui-proxy pod' })
    return
  }

  try {
    const loaded = await refreshCampaignMicrositeConfig()
    logInfo('Campaign microsite config refreshed from redis', JSON.stringify(loaded))
    res.status(200).json({
      loaded,
      redisKeys: {
        mobile: CONSTANTS.CAMPAIGN_MOBILE_REDIS_KEY,
        portal: CONSTANTS.CAMPAIGN_PORTAL_REDIS_KEY,
      },
    })
  } catch (err) {
    logError('Failed to refresh campaign microsite config from redis', String(err))
    res.status(500).json({ error: 'internal_error', message: CONSTANTS.INTERNAL_SERVER_ERR_MSG })
  }
}
