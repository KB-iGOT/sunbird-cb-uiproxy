const bootstrapMock = jest.fn()

jest.mock('./server', () => ({
  Server: { bootstrap: bootstrapMock },
}))

jest.mock('./utils/axios-retry', () => ({}))

jest.mock('./utils/logger', () => ({
  log: jest.fn(),
  logSuccess: jest.fn(),
  logWarnHeading: jest.fn(),
}))

import { log, logSuccess, logWarnHeading } from './utils/logger'

describe('index bootstrap', () => {
  const originalOn = process.on

  afterEach(() => {
    process.on = originalOn
  })

  it('bootstraps the server, logs success, and registers process-level handlers', () => {
    const handlers: { [event: string]: (...args: unknown[]) => void } = {}
    process.on = jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler
      return process
    }) as never

    jest.isolateModules(() => {
      // tslint:disable-next-line: no-var-requires
      require('./index')
    })

    expect(bootstrapMock).toHaveBeenCalled()
    expect(logSuccess).toHaveBeenCalledWith(expect.stringContaining('Worker started with process Id'))

    handlers.unhandledRejection('reason', 'promise')
    expect(logWarnHeading).toHaveBeenCalledWith('Unhandled Rejection')
    expect(log).toHaveBeenCalledWith('reason', 'promise')

    handlers.uncaughtException(new Error('boom'))
    expect(logWarnHeading).toHaveBeenCalledWith('Un caught exception')
  })
})
