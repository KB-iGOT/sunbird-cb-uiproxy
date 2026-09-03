jest.mock('../protectedApi_v8/discussionHub/users', () => ({
  getUserByUsername: jest.fn(),
}))

import { getUserByUsername } from '../protectedApi_v8/discussionHub/users'
import { getUserSlug, getUserUIDBySession, getWriteApiAdminUID, getWriteApiToken } from './discussionHub-helper'

const mockedGetUserByUsername = getUserByUsername as jest.Mock

describe('getWriteApiToken', () => {
  it('returns a Bearer-prefixed token from configuration', () => {
    expect(getWriteApiToken()).toMatch(/^Bearer /)
  })
})

describe('getWriteApiAdminUID', () => {
  it('returns a numeric UID from configuration', () => {
    expect(typeof getWriteApiAdminUID()).toBe('number')
    expect(Number.isNaN(getWriteApiAdminUID())).toBe(false)
  })
})

describe('getUserUIDBySession', () => {
  it('returns the uid stored on the session', async () => {
    // tslint:disable-next-line: no-any
    const req: any = { session: { uid: 'uid-1' } }
    await expect(getUserUIDBySession(req)).resolves.toBe('uid-1')
  })
})

describe('getUserSlug', () => {
  it('resolves the userslug when the user is found', async () => {
    mockedGetUserByUsername.mockResolvedValue({ userslug: 'jane-doe' })
    // tslint:disable-next-line: no-any
    await expect(getUserSlug({} as any, 'wid-1')).resolves.toBe('jane-doe')
  })

  it('rejects when the user lookup fails', async () => {
    mockedGetUserByUsername.mockRejectedValue(new Error('lookup failed'))
    // tslint:disable-next-line: no-any
    await expect(getUserSlug({} as any, 'wid-1')).rejects.toThrow('User not found')
  })

  it('resolves undefined when the user has no userslug', async () => {
    mockedGetUserByUsername.mockResolvedValue({})
    // tslint:disable-next-line: no-any
    await expect(getUserSlug({} as any, 'wid-1')).resolves.toBeUndefined()
  })
})
