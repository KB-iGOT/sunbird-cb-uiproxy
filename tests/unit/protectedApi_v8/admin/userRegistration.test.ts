jest.mock('../../../../src/utils/keycloak-user-creation', () => ({
  createKeycloakUser: jest.fn(),
  getAuthToken: jest.fn(),
  sendActionsEmail: jest.fn(),
  UpdateKeycloakUserPassword: jest.fn(),
}))
jest.mock('../../../../src/protectedApi_v8/user/details', () => ({ wTokenApiMock: jest.fn() }))
jest.mock('../../../../src/protectedApi_v8/user/roles', () => ({ updateRolesV2Mock: jest.fn() }))
jest.mock('../../../../src/utils/requestExtract', () => ({ extractUserIdFromRequest: jest.fn(() => 'admin-1') }))

import { createUser, performNewUserSteps } from '../../../../src/protectedApi_v8/admin/userRegistration'
import { wTokenApiMock } from '../../../../src/protectedApi_v8/user/details'
import { updateRolesV2Mock } from '../../../../src/protectedApi_v8/user/roles'
import {
  createKeycloakUser,
  getAuthToken,
  sendActionsEmail,
  UpdateKeycloakUserPassword,
} from '../../../../src/utils/keycloak-user-creation'

const mockedCreateKeycloakUser = createKeycloakUser as jest.Mock
const mockedGetAuthToken = getAuthToken as jest.Mock
const mockedSendActionsEmail = sendActionsEmail as jest.Mock
const mockedUpdatePassword = UpdateKeycloakUserPassword as jest.Mock
const mockedWToken = wTokenApiMock as jest.Mock
const mockedUpdateRoles = updateRolesV2Mock as jest.Mock

const req = { header: jest.fn(() => 'igot') }

describe('createUser', () => {
  it('resolves with the new keycloak id', async () => {
    mockedCreateKeycloakUser.mockResolvedValue({ id: 'kc-1' })
    await expect(createUser(req)).resolves.toBe('kc-1')
  })

  it('resolves undefined when keycloak returns no id', async () => {
    mockedCreateKeycloakUser.mockResolvedValue({})
    await expect(createUser(req)).resolves.toBeUndefined()
  })

  it('rejects with the keycloak error so callers can read err.response', async () => {
    const err = Object.assign(new Error('conflict'), { response: { status: 409 } })
    mockedCreateKeycloakUser.mockRejectedValue(err)
    await expect(createUser(req)).rejects.toBe(err)
  })
})

describe('performNewUserSteps', () => {
  beforeEach(() => {
    mockedUpdatePassword.mockResolvedValue(undefined)
    mockedGetAuthToken.mockResolvedValue({ access_token: 'tok' })
    mockedWToken.mockResolvedValue({ user: { wid: 'wid-1' } })
    mockedUpdateRoles.mockResolvedValue(undefined)
    mockedSendActionsEmail.mockResolvedValue(undefined)
  })

  it('resolves when every step succeeds and updates roles when given', async () => {
    await expect(performNewUserSteps('kc-1', req, 'a@b.com', ['R'])).resolves.toBeUndefined()
    expect(mockedUpdateRoles).toHaveBeenCalledWith('admin-1', { operation: 'add', roles: ['R'], users: ['wid-1'] }, 'igot')
    expect(mockedSendActionsEmail).toHaveBeenCalledWith('kc-1')
  })

  it('still runs the remaining steps and rejects with the first failure message', async () => {
    mockedUpdatePassword.mockRejectedValueOnce(new Error('down'))
    mockedSendActionsEmail.mockRejectedValue(new Error('smtp'))
    await expect(performNewUserSteps('kc-1', req, 'a@b.com')).rejects.toThrow('User default password could not be set')
    expect(mockedGetAuthToken).toHaveBeenCalled()
    expect(mockedSendActionsEmail).toHaveBeenCalled()
  })

  it('reports a roles update failure', async () => {
    mockedUpdateRoles.mockRejectedValue(new Error('down'))
    await expect(performNewUserSteps('kc-1', req, 'a@b.com', ['R'])).rejects.toThrow('Roles could not be updated')
  })

  it('reports a getAuthToken failure', async () => {
    mockedGetAuthToken.mockRejectedValue(new Error('down'))
    await expect(performNewUserSteps('kc-1', req, 'a@b.com')).rejects.toThrow('User getAuthToken failed')
  })
})
