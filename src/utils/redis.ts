import Redis from 'ioredis'
import { CONSTANTS } from './env'
import { logDebug } from './logger'

export const redis = new Redis(Number(CONSTANTS.IGOT_REDIS_PORT), CONSTANTS.IGOT_REDIS_HOST, {
    db: CONSTANTS.IGOT_REDIS_DB_INDEX,
})

redis.on('connect', () => {
    logDebug('Connected to Redis')
})

// tslint:disable-next-line: no-any
redis.on('error', (err: any) => {
    logDebug('Redis connection error: ' + err)
})
