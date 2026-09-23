jest.mock('fs', () => ({
  createWriteStream: jest.fn(() => ({ write: jest.fn() })),
}))

describe('fileLogger', () => {
  it('creates a write stream for a dated log file under <cwd>/logs', () => {
    // tslint:disable-next-line: no-var-requires
    const fs = require('fs')
    // tslint:disable-next-line: no-var-requires
    require('./fileLogger')

    expect(fs.createWriteStream).toHaveBeenCalledTimes(1)
    const [filePath, options] = fs.createWriteStream.mock.calls[0]
    expect(filePath).toMatch(new RegExp(`^${process.cwd().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/logs/\\d{4}_\\d{2}_\\d{2}\\.log$`))
    expect(options).toEqual({ flags: 'w' })
  })

  it('exposes a pino logger instance', () => {
    // tslint:disable-next-line: no-var-requires
    const { pino } = require('./fileLogger')
    expect(pino).toBeDefined()
    expect(typeof pino.info).toBe('function')
  })
})
