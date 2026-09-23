jest.mock('axios', () => jest.fn())
jest.mock('./request-adapter', () => ({
  request: { get: jest.fn() },
}))

import axios from 'axios'
import { PERMISSION_HELPER } from './permissionHelper'
import { request } from './request-adapter'

const mockedAxios = axios as unknown as jest.Mock
const mockedRequestGet = request.get as jest.Mock

// tslint:disable-next-line: no-any
function buildReq(overrides: any = {}): any {
  return {
    kauth: { grant: { access_token: { content: { sub: 'f:org:user-1' }, token: 'the-token' } } },
    session: {
      save: jest.fn((saveCb: (err: unknown) => void) => saveCb(null)),
    },
    ...overrides,
  }
}

describe('PERMISSION_HELPER.setRolesData', () => {
  it('invokes the callback with an error when there is no session', () => {
    const cb = jest.fn()
    PERMISSION_HELPER.setRolesData({ session: undefined }, cb, '{}')
    expect(cb).toHaveBeenCalledWith('reqObj.session no session', null)
  })

  it('populates session fields from the response body and persists via session.save', () => {
    const req = buildReq()
    const cb = jest.fn()
    const createSpy = jest.spyOn(PERMISSION_HELPER, 'createNodeBBUser').mockResolvedValue(undefined)
    const body = JSON.stringify({
      result: {
        response: {
          channel: 'ch-1',
          firstName: 'Jane',
          id: 'user-1',
          lastName: 'Doe',
          organisations: [{ organisationId: 'org-1' }],
          profileDetails: { userRoles: ['ADMIN'] },
          roles: ['PUBLIC'],
          rootOrgId: 'org-1',
          userName: 'jane.doe',
        },
      },
    })

    PERMISSION_HELPER.setRolesData(req, cb, body)

    expect(req.session.userId).toBe('user-1')
    expect(req.session.userName).toBe('jane.doe')
    expect(req.session.firstName).toBe('Jane')
    expect(req.session.lastName).toBe('Doe')
    expect(req.session.userRoles).toEqual(['PUBLIC'])
    expect(req.session.orgs).toEqual([{ organisationId: 'org-1' }])
    expect(req.session.rootOrgId).toBe('org-1')
    expect(req.session.channel).toBe('ch-1')
    expect(req.session.userPositions).toEqual(['ADMIN'])
    expect(req.session.save).toHaveBeenCalled()
    // Called once unconditionally, once more inside the successful session.save callback.
    expect(createSpy).toHaveBeenCalledTimes(2)

    createSpy.mockRestore()
  })

  it('defaults userPositions to an empty array when profileDetails.userRoles is absent', () => {
    const req = buildReq()
    const createSpy = jest.spyOn(PERMISSION_HELPER, 'createNodeBBUser').mockResolvedValue(undefined)
    const body = JSON.stringify({ result: { response: { id: 'user-1' } } })

    PERMISSION_HELPER.setRolesData(req, jest.fn(), body)

    expect(req.session.userPositions).toEqual([])
    createSpy.mockRestore()
  })

  it('invokes the callback with the save error and still calls createNodeBBUser once', () => {
    const req = buildReq({ session: { save: jest.fn((saveCb: (err: unknown) => void) => saveCb('save failed')) } })
    const cb = jest.fn()
    const createSpy = jest.spyOn(PERMISSION_HELPER, 'createNodeBBUser').mockResolvedValue(undefined)
    const body = JSON.stringify({ result: { response: { id: 'user-1' } } })

    PERMISSION_HELPER.setRolesData(req, cb, body)

    expect(cb).toHaveBeenCalledWith('save failed', null)
    expect(createSpy).toHaveBeenCalledTimes(1)
    createSpy.mockRestore()
  })
})

describe('PERMISSION_HELPER.setNodeBBUID', () => {
  it('stores the nodeBB uid on the session and resolves with the payload on save success', () => {
    const req = buildReq()
    const cb = jest.fn()
    const body = { data: { result: { userId: { uid: 'nbb-1' } } } }

    PERMISSION_HELPER.setNodeBBUID(req, cb, body)

    expect(req.session.uid).toBe('nbb-1')
    expect(cb).toHaveBeenCalledWith(null, body)
  })

  it('calls back with (null, null) when the session fails to save', () => {
    const req = buildReq({ session: { save: jest.fn((saveCb: (err: unknown) => void) => saveCb('boom')) } })
    const cb = jest.fn()
    const body = { data: { result: { userId: { uid: 'nbb-1' } } } }

    PERMISSION_HELPER.setNodeBBUID(req, cb, body)

    expect(cb).toHaveBeenCalledWith(null, null)
  })
})

describe('PERMISSION_HELPER.getCurrentUserRoles', () => {
  it('delegates to setRolesData when the user lookup responds OK', () => {
    const req = buildReq({ session: { save: jest.fn((saveCb: (err: unknown) => void) => saveCb(null)), userId: 'user-1' } })
    const cb = jest.fn()
    const setRolesSpy = jest.spyOn(PERMISSION_HELPER, 'setRolesData').mockImplementation(() => undefined)
    const body = JSON.stringify({ responseCode: 'OK', result: { response: { id: 'user-1' } } })
    mockedRequestGet.mockImplementation((_opts, done) => done(null, null, body))

    PERMISSION_HELPER.getCurrentUserRoles(req, cb)

    expect(setRolesSpy).toHaveBeenCalledWith(req, cb, body)
    setRolesSpy.mockRestore()
  })

  it('calls back with an error message when the response code is not OK', () => {
    const req = buildReq({ session: { userId: 'user-1' } })
    const cb = jest.fn()
    const body = JSON.stringify({ responseCode: 'FAILED' })
    mockedRequestGet.mockImplementation((_opts, done) => done(null, null, body))

    PERMISSION_HELPER.getCurrentUserRoles(req, cb)

    expect(cb).toHaveBeenCalledWith(expect.stringContaining('Failed to read the user'), null)
  })

  it('calls back with the transport error when the request fails', () => {
    const req = buildReq({ session: { userId: 'user-1' } })
    const cb = jest.fn()
    const err = new Error('network down')
    mockedRequestGet.mockImplementation((_opts, done) => done(err, null, null))

    PERMISSION_HELPER.getCurrentUserRoles(req, cb)

    expect(cb).toHaveBeenCalledWith(err, null)
  })
})

describe('PERMISSION_HELPER.createNodeBBUser', () => {
  it('forwards the axios response to setNodeBBUID on success', async () => {
    const req = buildReq({ session: { firstName: 'Jane', lastName: 'Doe', userId: 'user-1', userName: 'jane.doe' } })
    const cb = jest.fn()
    const setUidSpy = jest.spyOn(PERMISSION_HELPER, 'setNodeBBUID').mockImplementation(() => undefined)
    const nodeBBResp = { data: { result: { userId: { uid: 'nbb-1' } } } }
    mockedAxios.mockResolvedValue(nodeBBResp)

    await PERMISSION_HELPER.createNodeBBUser(req, cb)

    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { request: { fullname: 'Jane Doe', identifier: 'user-1', username: 'jane.doe' } },
        method: 'POST',
      })
    )
    expect(setUidSpy).toHaveBeenCalledWith(req, cb, nodeBBResp)
    setUidSpy.mockRestore()
  })

  it('calls back with (null, null) when the axios call fails', async () => {
    const req = buildReq()
    const cb = jest.fn()
    mockedAxios.mockRejectedValue(new Error('nodebb unreachable'))

    await PERMISSION_HELPER.createNodeBBUser(req, cb)

    expect(cb).toHaveBeenCalledWith(null, null)
  })
})
