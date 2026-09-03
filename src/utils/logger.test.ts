import {
  getLogLevel,
  isValidLogLevel,
  logDebug,
  logError,
  logInfo,
  resetLogLevel,
  setLogLevel,
} from './logger'

describe('isValidLogLevel', () => {
  it('accepts every known pino log level', () => {
    const levels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']
    levels.forEach((level) => {
      expect(isValidLogLevel(level)).toBe(true)
    })
  })

  it('rejects unknown strings and non-strings', () => {
    expect(isValidLogLevel('verbose')).toBe(false)
    expect(isValidLogLevel(42)).toBe(false)
    expect(isValidLogLevel(undefined)).toBe(false)
  })
})

describe('log level get/set/reset', () => {
  afterEach(() => {
    resetLogLevel()
  })

  it('setLogLevel changes the level reported by getLogLevel', () => {
    setLogLevel('debug')
    expect(getLogLevel()).toBe('debug')
  })

  it('resetLogLevel restores the default level', () => {
    setLogLevel('trace')
    resetLogLevel()
    expect(getLogLevel()).toBe(getLogLevel())
    expect(isValidLogLevel(getLogLevel())).toBe(true)
  })
})

describe('log functions', () => {
  it('do not throw when called with one or more messages', () => {
    expect(() => logInfo('hello')).not.toThrow()
    expect(() => logDebug('a', 'b', 'c')).not.toThrow()
    expect(() => logError('boom')).not.toThrow()
  })
})
