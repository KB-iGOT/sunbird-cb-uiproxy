jest.mock('@keycloak/keycloak-admin-client/lib/defs/requiredActionProviderRepresentation', () => ({
  RequiredActionAlias: { VERIFY_EMAIL: 'VERIFY_EMAIL' },
}))

jest.mock('cassandra-driver', () => {
  // tslint:disable-next-line: no-any
  const mockExecute = jest.fn()
  // tslint:disable-next-line: no-any
  const mockShutdown = jest.fn()
  return {
    Client: jest.fn().mockImplementation(() => ({ execute: mockExecute, shutdown: mockShutdown })),
    __mockExecute: mockExecute,
    __mockShutdown: mockShutdown,
  }
})

jest.mock('@keycloak/keycloak-admin-client', () => {
  // tslint:disable-next-line: no-any
  const mockClient = {
    auth: jest.fn().mockResolvedValue(undefined),
    setConfig: jest.fn(),
    users: {
      create: jest.fn(),
      executeActionsEmail: jest.fn(),
      resetPassword: jest.fn(),
    },
  }
  return {
    __esModule: true,
    __mockKcClient: mockClient,
    default: jest.fn().mockImplementation(() => mockClient),
  }
})

jest.mock('request', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.post = jest.fn()
  return fn
})

// tslint:disable-next-line: no-var-requires
const { __mockExecute, __mockShutdown } = require('cassandra-driver')
// tslint:disable-next-line: no-var-requires
const { __mockKcClient } = require('@keycloak/keycloak-admin-client')
// tslint:disable-next-line: no-var-requires
const mockedRequest = require('request')

import {
  UpdateKeycloakUserPassword,
  checkUUIDMaster,
  checkUniqueKey,
  createKeycloakUser,
  sendActionsEmail,
  updateUUIDMaster,
  updateUniqueKey,
} from './keycloak-user-creation'

describe('checkUniqueKey', () => {
  it('calls back with the matching row when found', (done) => {
    __mockExecute.mockImplementation((_q: string, cb: (err: unknown, result: unknown) => void) => {
      cb(null, { rows: [{ active: true, key: 'abc' }] })
    })
    checkUniqueKey('abc', (err, row) => {
      expect(err).toBeNull()
      expect(row).toEqual({ active: true, key: 'abc' })
      // shutdown() runs as the statement right after this callback returns, not before
      setImmediate(() => {
        expect(__mockShutdown).toHaveBeenCalled()
        done()
      })
    })
  })

  it('calls back with an error when no rows are found', (done) => {
    __mockExecute.mockImplementation((_q: string, cb: (err: unknown, result: unknown) => void) => {
      cb(null, { rows: [] })
    })
    checkUniqueKey('missing', (err) => {
      expect(err).toBeInstanceOf(Error)
      done()
    })
  })
})

describe('checkUUIDMaster', () => {
  it('resolves with the matching row when found', async () => {
    __mockExecute.mockImplementation((_q: string, cb: (err: unknown, result: unknown) => void) => {
      cb(null, { rows: [{ active: true, email: 'a@b.com' }] })
    })
    await expect(checkUUIDMaster('abc')).resolves.toEqual({ active: true, email: 'a@b.com' })
  })

  it('rejects when no rows are found', async () => {
    __mockExecute.mockImplementation((_q: string, cb: (err: unknown, result: unknown) => void) => {
      cb(null, { rows: [] })
    })
    await expect(checkUUIDMaster('missing')).rejects.toBe(false)
  })
})

describe('updateUniqueKey', () => {
  it('calls back with the result on success', (done) => {
    __mockExecute.mockImplementation((_q: string, cb: (err: unknown, result: unknown) => void) => {
      cb(null, { updated: true })
    })
    updateUniqueKey('abc', (err, result) => {
      expect(err).toBeNull()
      expect(result).toEqual({ updated: true })
      done()
    })
  })

  it('calls back with an error when there is no result', (done) => {
    __mockExecute.mockImplementation((_q: string, cb: (err: unknown, result: unknown) => void) => {
      cb(null, null)
    })
    updateUniqueKey('abc', (err) => {
      expect(err).toBeInstanceOf(Error)
      done()
    })
  })
})

describe('updateUUIDMaster', () => {
  it('resolves with the result on success', async () => {
    __mockExecute.mockImplementation((_q: string, cb: (err: unknown, result: unknown) => void) => {
      cb(null, { updated: true })
    })
    await expect(updateUUIDMaster('abc', 'a@b.com')).resolves.toEqual({ updated: true })
  })

  it('rejects when there is no result', async () => {
    __mockExecute.mockImplementation((_q: string, cb: (err: unknown, result: unknown) => void) => {
      cb(null, null)
    })
    await expect(updateUUIDMaster('abc', 'a@b.com')).rejects.toThrow()
  })
})

describe('createKeycloakUser', () => {
  it('authenticates and creates the keycloak user', async () => {
    __mockKcClient.users.create.mockResolvedValue({ id: 'kc-1' })
    const result = await createKeycloakUser({ body: { email: 'a@b.com', fname: 'Jane', lname: 'Doe' } })
    expect(result).toEqual({ id: 'kc-1' })
    expect(__mockKcClient.auth).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'admin-cli', grantType: 'password' }))
    expect(__mockKcClient.users.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'a@b.com', firstName: 'Jane', lastName: 'Doe', username: 'a@b.com' })
    )
  })

  it('propagates an error when creation fails', async () => {
    __mockKcClient.users.create.mockRejectedValue({ response: { status: 409 } })
    await expect(createKeycloakUser({ body: { email: 'a@b.com' } })).rejects.toEqual({ response: { status: 409 } })
  })
})

describe('UpdateKeycloakUserPassword', () => {
  it('resets the password using the default new-user password', async () => {
    __mockKcClient.users.resetPassword.mockResolvedValue(undefined)
    await UpdateKeycloakUserPassword('kc-1', false)
    expect(__mockKcClient.users.resetPassword).toHaveBeenCalledWith(
      expect.objectContaining({ credential: expect.objectContaining({ temporary: false, type: 'password' }), id: 'kc-1' })
    )
  })

  it('propagates an error when the reset fails', async () => {
    __mockKcClient.users.resetPassword.mockRejectedValue(new Error('reset failed'))
    await expect(UpdateKeycloakUserPassword('kc-1', true)).rejects.toThrow('reset failed')
  })
})

describe('sendActionsEmail', () => {
  it('authenticates as the portal client and triggers the verify-email action', async () => {
    __mockKcClient.users.executeActionsEmail.mockResolvedValue({ sent: true })
    const result = await sendActionsEmail('user-1')
    expect(result).toEqual({ sent: true })
    expect(__mockKcClient.auth).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'portal', grantType: 'password' }))
    expect(__mockKcClient.users.executeActionsEmail).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 'portal', id: 'user-1' })
    )
  })
})

describe('getAuthToken', () => {
  it('resolves with the parsed token body', async () => {
    // tslint:disable-next-line: no-var-requires
    const { getAuthToken } = require('./keycloak-user-creation')
    mockedRequest.post.mockImplementation((_opts: unknown, cb: (err: unknown, res: unknown, body: string) => void) => {
      cb(null, {}, JSON.stringify({ access_token: 'tok-1' }))
    })
    const result = await getAuthToken('a@b.com')
    expect(result).toEqual({ access_token: 'tok-1' })
  })
})
