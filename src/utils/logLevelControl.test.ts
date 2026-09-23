jest.mock('./redis', () => ({
  redis: {
    get: jest.fn(),
    set: jest.fn(),
  },
}))

import { CONSTANTS } from './env'
import { getLogLevel, resetLogLevel, setLogLevel } from './logger'
import {
  getLogLevelHandler,
  resetLogLevelHandler,
  setLogLevelHandler,
  startLogLevelSync,
  stopLogLevelSync,
  syncLogLevelFromRedisOnce,
} from './logLevelControl'
import { redis } from './redis'
import { ROLE } from './roles'

const mockedRedis = redis as unknown as { get: jest.Mock; set: jest.Mock }
const mutableConstants = CONSTANTS as { LOG_LEVEL_SYNC_ENABLED: string }

function setSyncEnabled(enabled: boolean) {
  mutableConstants.LOG_LEVEL_SYNC_ENABLED = String(enabled)
}

// tslint:disable-next-line: no-any
function buildRes() {
  const res: any = {}
  res.status = jest.fn().mockReturnValue(res)
  res.json = jest.fn().mockReturnValue(res)
  return res
}

// tslint:disable-next-line: no-any
function buildReq(roles: string[] = []): any {
  return { session: { userRoles: roles } }
}

describe('syncLogLevelFromRedisOnce', () => {
  afterEach(() => {
    setSyncEnabled(false)
    resetLogLevel()
  })

  it('does nothing when sync is disabled', async () => {
    setSyncEnabled(false)
    await syncLogLevelFromRedisOnce()
    expect(mockedRedis.get).not.toHaveBeenCalled()
  })

  it('does nothing when redis has no configured level', async () => {
    setSyncEnabled(true)
    mockedRedis.get.mockResolvedValue(null)
    await syncLogLevelFromRedisOnce()
    expect(getLogLevel()).not.toBeNull()
  })

  it('ignores an invalid level stored in redis', async () => {
    setSyncEnabled(true)
    const before = getLogLevel()
    mockedRedis.get.mockResolvedValue('not-a-real-level')
    await syncLogLevelFromRedisOnce()
    expect(getLogLevel()).toBe(before)
  })

  it('applies a valid level from redis', async () => {
    setSyncEnabled(true)
    mockedRedis.get.mockResolvedValue('debug')
    await syncLogLevelFromRedisOnce()
    expect(getLogLevel()).toBe('debug')
  })

  it('does not throw when redis.get rejects', async () => {
    setSyncEnabled(true)
    mockedRedis.get.mockRejectedValue(new Error('redis down'))
    await expect(syncLogLevelFromRedisOnce()).resolves.toBeUndefined()
  })
})

describe('startLogLevelSync / stopLogLevelSync', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    mockedRedis.get.mockResolvedValue(null)
  })

  afterEach(() => {
    stopLogLevelSync()
    jest.useRealTimers()
    setSyncEnabled(false)
  })

  it('does not schedule polling when sync is disabled', () => {
    setSyncEnabled(false)
    const setIntervalSpy = jest.spyOn(global, 'setInterval')
    startLogLevelSync()
    expect(setIntervalSpy).not.toHaveBeenCalled()
  })

  it('schedules polling when sync is enabled, and stop clears it', () => {
    setSyncEnabled(true)
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval')
    startLogLevelSync()
    stopLogLevelSync()
    expect(clearIntervalSpy).toHaveBeenCalled()
  })

  it('stopLogLevelSync is a no-op when nothing was started', () => {
    expect(() => stopLogLevelSync()).not.toThrow()
  })
})

describe('getLogLevelHandler', () => {
  afterEach(() => resetLogLevel())

  it('returns 403 for a non-SPV_ADMIN session', () => {
    const req = buildReq([])
    const res = buildRes()
    getLogLevelHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns the current level for an SPV_ADMIN session', () => {
    const req = buildReq([ROLE.SPV_ADMIN])
    const res = buildRes()
    getLogLevelHandler(req, res)
    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ current: getLogLevel() }))
  })
})

describe('setLogLevelHandler', () => {
  afterEach(() => resetLogLevel())

  it('returns 403 for a non-SPV_ADMIN session', async () => {
    const req = { ...buildReq([]), body: { level: 'debug' } }
    const res = buildRes()
    await setLogLevelHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('returns 400 for an invalid level', async () => {
    const req = { ...buildReq([ROLE.SPV_ADMIN]), body: { level: 'not-a-level' } }
    const res = buildRes()
    await setLogLevelHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(400)
  })

  it('sets a valid level and persists it to redis', async () => {
    const req = { ...buildReq([ROLE.SPV_ADMIN]), body: { level: 'warn' } }
    const res = buildRes()
    mockedRedis.set.mockResolvedValue('OK')
    await setLogLevelHandler(req, res)
    expect(getLogLevel()).toBe('warn')
    expect(mockedRedis.set).toHaveBeenCalledWith(CONSTANTS.LOG_LEVEL_REDIS_KEY, 'warn')
    expect(res.json).toHaveBeenCalledWith({ current: 'warn' })
  })

  it('still responds successfully when persisting to redis fails', async () => {
    const req = { ...buildReq([ROLE.SPV_ADMIN]), body: { level: 'info' } }
    const res = buildRes()
    mockedRedis.set.mockRejectedValue(new Error('redis down'))
    await expect(setLogLevelHandler(req, res)).resolves.toBeUndefined()
    expect(res.json).toHaveBeenCalledWith({ current: 'info' })
  })
})

describe('resetLogLevelHandler', () => {
  afterEach(() => resetLogLevel())

  it('returns 403 for a non-SPV_ADMIN session', async () => {
    const req = buildReq([])
    const res = buildRes()
    await resetLogLevelHandler(req, res)
    expect(res.status).toHaveBeenCalledWith(403)
  })

  it('resets the level and persists the default to redis', async () => {
    setLogLevel('trace')
    const req = buildReq([ROLE.SPV_ADMIN])
    const res = buildRes()
    mockedRedis.set.mockResolvedValue('OK')
    await resetLogLevelHandler(req, res)
    expect(getLogLevel()).not.toBe('trace')
    expect(mockedRedis.set).toHaveBeenCalled()
    expect(res.json).toHaveBeenCalledWith({ current: getLogLevel() })
  })
})
