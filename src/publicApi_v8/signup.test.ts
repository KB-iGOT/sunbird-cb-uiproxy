jest.mock('../protectedApi_v8/admin/userRegistration', () => ({
  createUser: jest.fn(),
  performNewUserSteps: jest.fn(),
}))

jest.mock('../utils/keycloak-user-creation', () => ({
  UpdateKeycloakUserPassword: jest.fn(),
  checkUUIDMaster: jest.fn(),
  checkUniqueKey: jest.fn(),
  createKeycloakUser: jest.fn(),
  updateUUIDMaster: jest.fn(),
  updateUniqueKey: jest.fn(),
}))

import express from 'express'
import supertest from 'supertest'
import { createUser, performNewUserSteps } from '../protectedApi_v8/admin/userRegistration'
import {
  UpdateKeycloakUserPassword,
  checkUUIDMaster,
  checkUniqueKey,
  createKeycloakUser,
  updateUUIDMaster,
  updateUniqueKey,
} from '../utils/keycloak-user-creation'
import { getMaskedEmail, getMaskedString, signup } from './signup'

const mockedCheckUniqueKey = checkUniqueKey as jest.Mock
const mockedCreateKeycloakUser = createKeycloakUser as jest.Mock
const mockedUpdateUniqueKey = updateUniqueKey as jest.Mock
const mockedUpdateKeycloakUserPassword = UpdateKeycloakUserPassword as jest.Mock
const mockedCheckUUIDMaster = checkUUIDMaster as jest.Mock
const mockedCreateUser = createUser as jest.Mock
const mockedPerformNewUserSteps = performNewUserSteps as jest.Mock
const mockedUpdateUUIDMaster = updateUUIDMaster as jest.Mock

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(signup)
  return app
}

describe('getMaskedString', () => {
  it('keeps the first and last characters and masks everything in between', () => {
    expect(getMaskedString('gmail')).toBe('g***l')
  })

  it('returns an empty string for falsy input', () => {
    expect(getMaskedString('')).toBe('')
  })
})

describe('getMaskedEmail', () => {
  it('masks the local part, provider and domain of an email, keeping the first/last char of each', () => {
    expect(getMaskedEmail('jane@gmail.com')).toBe('j**e@g***l.c*m')
  })

  it('returns an empty string for a falsy email', () => {
    expect(getMaskedEmail('')).toBe('')
  })
})

describe('signup POST /', () => {
  it('rejects an invalid/unknown unique code', async () => {
    mockedCheckUniqueKey.mockImplementation((_id, cb) => cb(new Error('not found'), null))
    const res = await supertest(buildApp()).post('/').send({ code: 'bad-code', email: 'a@b.com' })
    expect(res.status).toBe(400)
    expect(res.text).toContain('Wrong Code')
  })

  it('creates the keycloak user and sets a default password on success', async () => {
    mockedCheckUniqueKey.mockImplementation((_id, cb) => cb(null, { active: true }))
    mockedCreateKeycloakUser.mockResolvedValue({ id: 'kc-1' })
    mockedUpdateUniqueKey.mockImplementation((_id, cb) => cb(null, { updated: true }))
    mockedUpdateKeycloakUserPassword.mockResolvedValue(undefined)

    const res = await supertest(buildApp()).post('/').send({ code: 'good-code', email: 'a@b.com' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ id: 'kc-1' })
    expect(mockedUpdateKeycloakUserPassword).toHaveBeenCalledWith('kc-1', false)
  })
})

describe('signup POST /create/:uniqueId', () => {
  it('registers a new user end to end when the code is active', async () => {
    mockedCheckUUIDMaster.mockResolvedValue({
      active: true, email: 'jane@example.com', firstname: 'Jane', lastname: 'Doe',
    })
    mockedCreateUser.mockResolvedValue('user-1')
    mockedPerformNewUserSteps.mockResolvedValue(undefined)
    mockedUpdateUUIDMaster.mockResolvedValue(undefined)

    const res = await supertest(buildApp()).post('/create/abc123')

    expect(res.status).toBe(200)
    expect(res.body.msg).toContain('successfully registered')
    expect(mockedUpdateUUIDMaster).toHaveBeenCalledWith('abc123', 'jane@example.com')
  })

  it('reports a friendly message when performNewUserSteps fails', async () => {
    mockedCheckUUIDMaster.mockResolvedValue({
      active: true, email: 'jane@example.com', firstname: 'Jane', lastname: 'Doe',
    })
    mockedCreateUser.mockResolvedValue('user-1')
    mockedPerformNewUserSteps.mockRejectedValue(new Error('profile step failed'))
    mockedUpdateUUIDMaster.mockResolvedValue(undefined)

    const res = await supertest(buildApp()).post('/create/abc123')

    expect(res.status).toBe(200)
    expect(res.body.msg).toContain('profile step failed')
  })

  it('reports a conflict message when the user already exists in keycloak', async () => {
    mockedCheckUUIDMaster.mockResolvedValue({
      active: true, email: 'jane@example.com', firstname: 'Jane', lastname: 'Doe',
    })
    mockedCreateUser.mockRejectedValue({ response: { status: 409 } })

    const res = await supertest(buildApp()).post('/create/abc123')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ msg: '1004: User with email already exists' })
    expect(mockedPerformNewUserSteps).not.toHaveBeenCalled()
  })
})
