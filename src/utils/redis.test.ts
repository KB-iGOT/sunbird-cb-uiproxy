const onMock = jest.fn()
const redisCtorMock = jest.fn().mockImplementation(() => ({ on: onMock }))

jest.mock('ioredis', () => ({
  __esModule: true,
  default: redisCtorMock,
}))

jest.mock('./logger', () => ({
  logDebug: jest.fn(),
}))

import { logDebug } from './logger'

describe('redis client', () => {
  it('constructs an ioredis client with the configured port and host, and wires connect/error handlers', () => {
    jest.isolateModules(() => {
      // tslint:disable-next-line: no-var-requires
      require('./redis')
    })

    expect(redisCtorMock).toHaveBeenCalled()
    expect(onMock).toHaveBeenCalledWith('connect', expect.any(Function))
    expect(onMock).toHaveBeenCalledWith('error', expect.any(Function))

    const connectHandler = onMock.mock.calls.find((c) => c[0] === 'connect')[1]
    connectHandler()
    expect(logDebug).toHaveBeenCalledWith('Connected to Redis')

    const errorHandler = onMock.mock.calls.find((c) => c[0] === 'error')[1]
    errorHandler('boom')
    expect(logDebug).toHaveBeenCalledWith('Redis connection error: boom')
  })
})
