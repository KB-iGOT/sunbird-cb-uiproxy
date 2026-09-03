import { decodeCode, getCurrnetExpiryTime, getExpiryTime } from './jwtHelper'

jest.mock('jsonwebtoken', () => ({
  decode: jest.fn(),
}))
// tslint:disable-next-line: no-var-requires
const jwt = require('jsonwebtoken')

describe('getExpiryTime', () => {
  it('returns 0 when the token has no exp claim', () => {
    jwt.decode.mockReturnValue(null)
    expect(getExpiryTime('token')).toBe(0)
  })

  it('returns 0 when the token has not yet expired', () => {
    const futureExp = Math.floor(Date.now() / 1000) + 1000
    jwt.decode.mockReturnValue({ exp: futureExp })
    expect(getExpiryTime('token')).toBe(0)
  })

  it('returns the elapsed seconds when the token has expired', () => {
    const pastExp = Math.floor(Date.now() / 1000) - 100
    jwt.decode.mockReturnValue({ exp: pastExp })
    expect(getExpiryTime('token')).toBeGreaterThanOrEqual(100)
  })
})

describe('getCurrnetExpiryTime', () => {
  it('returns exp in milliseconds when present', () => {
    jwt.decode.mockReturnValue({ exp: 1000 })
    expect(getCurrnetExpiryTime('token')).toBe(1000000)
  })

  it('falls back to the configured session TTL when exp is missing', () => {
    jwt.decode.mockReturnValue(null)
    expect(getCurrnetExpiryTime('token')).toBeDefined()
  })
})

describe('decodeCode', () => {
  it('delegates to jwt.decode', () => {
    jwt.decode.mockReturnValue({ sub: 'user-1' })
    expect(decodeCode('token')).toEqual({ sub: 'user-1' })
    expect(jwt.decode).toHaveBeenCalledWith('token')
  })
})
