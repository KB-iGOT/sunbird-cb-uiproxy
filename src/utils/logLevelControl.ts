import { Request, Response } from 'express'
import { CONSTANTS } from './env'
import { getLogLevel, isValidLogLevel, logError, logInfo, logWarn, resetLogLevel, setLogLevel } from './logger'
import { redis } from './redis'
import { ROLE } from './roles'

let timer: NodeJS.Timeout | undefined
const SPV_ADMIN_FORBIDDEN_MESSAGE = 'Only SPV_ADMIN can access this API'

function isSyncEnabled(): boolean {
  return String(CONSTANTS.LOG_LEVEL_SYNC_ENABLED).toLowerCase() === 'true'
}

function hasSpvAdminRole(req: Request): boolean {
  // tslint:disable-next-line: no-any
  const roles = ((req as any).session && (req as any).session.userRoles) || []
  return Array.isArray(roles) && roles.includes(ROLE.SPV_ADMIN)
}

export async function syncLogLevelFromRedisOnce(): Promise<void> {
  if (!isSyncEnabled()) {
    return
  }

  try {
    const configured = await redis.get(CONSTANTS.LOG_LEVEL_REDIS_KEY)
    if (!configured) {
      return
    }

    const nextLevel = configured.trim().toLowerCase()
    if (!isValidLogLevel(nextLevel)) {
      logWarn(`Invalid log level in redis key ${CONSTANTS.LOG_LEVEL_REDIS_KEY}: ${configured}`)
      return
    }

    if (getLogLevel() !== nextLevel) {
      setLogLevel(nextLevel)
      logInfo(`Log level updated from redis: ${nextLevel}`)
    }
  } catch (err) {
    logError('Failed to sync log level from redis', String(err))
  }
}

export function startLogLevelSync(): void {
  if (!isSyncEnabled()) {
    return
  }

  void syncLogLevelFromRedisOnce()
  timer = setInterval(() => {
    void syncLogLevelFromRedisOnce()
  }, Number(CONSTANTS.LOG_LEVEL_POLL_INTERVAL_MS) || 10000)

  logInfo(
    `Log level sync enabled: key=${CONSTANTS.LOG_LEVEL_REDIS_KEY}`,
    `intervalMs=${CONSTANTS.LOG_LEVEL_POLL_INTERVAL_MS}`
  )
}

export function stopLogLevelSync(): void {
  if (timer) {
    clearInterval(timer)
    timer = undefined
  }
}

export function getLogLevelHandler(req: Request, res: Response): void {
  if (!hasSpvAdminRole(req)) {
    res.status(403).json({ error: 'forbidden', message: SPV_ADMIN_FORBIDDEN_MESSAGE })
    return
  }

  res.json({
    current: getLogLevel(),
    default: CONSTANTS.LOG_LEVEL,
    redisKey: CONSTANTS.LOG_LEVEL_REDIS_KEY,
    syncEnabled: isSyncEnabled(),
  })
}

export async function setLogLevelHandler(req: Request, res: Response): Promise<void> {
  if (!hasSpvAdminRole(req)) {
    res.status(403).json({ error: 'forbidden', message: SPV_ADMIN_FORBIDDEN_MESSAGE })
    return
  }

  const requested = String(req.body && req.body.level ? req.body.level : '').trim().toLowerCase()
  if (!isValidLogLevel(requested)) {
    res.status(400).json({
      error: 'bad_request',
      message: 'Invalid level. Use one of: fatal,error,warn,info,debug,trace,silent',
    })
    return
  }

  setLogLevel(requested)

  try {
    await redis.set(CONSTANTS.LOG_LEVEL_REDIS_KEY, requested)
  } catch (err) {
    logError('Unable to persist log level in redis', String(err))
  }

  res.json({ current: getLogLevel() })
}

export async function resetLogLevelHandler(req: Request, res: Response): Promise<void> {
  if (!hasSpvAdminRole(req)) {
    res.status(403).json({ error: 'forbidden', message: SPV_ADMIN_FORBIDDEN_MESSAGE })
    return
  }

  resetLogLevel()

  try {
    await redis.set(CONSTANTS.LOG_LEVEL_REDIS_KEY, String(CONSTANTS.LOG_LEVEL || 'error'))
  } catch (err) {
    logError('Unable to persist reset log level in redis', String(err))
  }

  res.json({ current: getLogLevel() })
}
