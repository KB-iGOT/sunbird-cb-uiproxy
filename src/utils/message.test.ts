import { ERROR } from './message'

describe('ERROR', () => {
  it('exposes non-empty string messages for every known key', () => {
    Object.values(ERROR).forEach((value) => {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
    })
  })

  it('contains the well-known auth error messages', () => {
    expect(ERROR.ERROR_NO_AUTHORIZATION).toBe('No Authorization header found in request headers')
    expect(ERROR.ERROR_NO_USER_TOKEN).toBe('No X-Authenticated-User-Token found in request headers')
  })
})
