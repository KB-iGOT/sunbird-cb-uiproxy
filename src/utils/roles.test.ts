import { ROLE } from './roles'

describe('ROLE', () => {
  it('maps every key to a non-empty string value', () => {
    Object.entries(ROLE).forEach(([key, value]) => {
      expect(typeof value).toBe('string')
      expect((value as string).length).toBeGreaterThan(0)
      expect(key.length).toBeGreaterThan(0)
    })
  })

  it('contains well-known roles used elsewhere in the codebase', () => {
    expect(ROLE.CBC_ADMIN).toBe('CBC_ADMIN')
    expect(ROLE.MDO_ADMIN).toBe('MDO_ADMIN')
    expect(ROLE.PUBLIC).toBe('PUBLIC')
  })
})
