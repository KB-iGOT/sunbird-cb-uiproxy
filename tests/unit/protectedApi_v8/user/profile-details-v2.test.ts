jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.get = jest.fn()
  fn.post = jest.fn()
  fn.patch = jest.fn()
  return fn
})
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFile: jest.fn(),
}))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import * as fs from 'fs'
import supertest from 'supertest'
import { profileDeatailsApi } from '../../../../src/protectedApi_v8/user/profile-details-v2'

const mockedAxios = axios as unknown as jest.Mock
const mockedAxiosGet = axios.get as jest.Mock
const mockedAxiosPost = axios.post as jest.Mock
const mockedAxiosPatch = axios.patch as jest.Mock
const mockedReadFile = fs.readFile as unknown as jest.Mock

function buildApp(router: express.Router = profileDeatailsApi) {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(router)
  return app
}

const defaultReadResponse = {
  data: {
    params: { status: 'SUCCESS' },
    result: { response: { firstName: 'user test', identifier: 'u1', rootOrgId: 'org1', userName: 'u1' } },
  },
}

// tslint:disable-next-line: no-any
function setupAxiosMock(mock: jest.Mock, overrides: any = {}, captured: any = {}) {
  // tslint:disable-next-line: no-any
  mock.mockImplementation((config: any) => {
    if (config.url.includes('/user/v5/create')) {
      captured.createUserBody = config.data.request
      return overrides.create ? overrides.create(config) : Promise.resolve({ data: { result: { userId: 'u1' } } })
    }
    if (config.url.includes('/user/v2/read/')) {
      return overrides.read ? overrides.read(config) : Promise.resolve(defaultReadResponse)
    }
    if (config.url.includes('/password/reset')) {
      return overrides.passwordReset
        ? overrides.passwordReset(config)
        : Promise.resolve({ data: { params: { status: 'SUCCESS' }, result: { link: 'http://reset' } } })
    }
    if (config.url.includes('/notification/email')) {
      return overrides.welcomeEmail ? overrides.welcomeEmail(config) : Promise.resolve({ data: { params: { status: 'SUCCESS' } } })
    }
    if (config.url.includes('/user/v1/search')) {
      captured.searchCalled = true
      return overrides.search ? overrides.search(config) : Promise.resolve({ data: { result: { response: { count: 0 } } } })
    }
    if (config.url.includes('/discussion/user/v1/create')) {
      captured.nodebbCalled = true
      return overrides.nodebb ? overrides.nodebb(config) : Promise.resolve({ data: {} })
    }
    return Promise.resolve({ data: {} })
  })
}

const basePersonalDetails = {
  channel: 'Dept of Project management',
  email: 'usertest@yopmail.com',
  firstName: 'user test',
  phone: '6161616161',
  roles: ['PUBLIC'],
}

beforeEach(() => {
  mockedAxios.mockReset()
  mockedAxiosGet.mockReset()
  mockedAxiosPost.mockReset()
  mockedAxiosPatch.mockReset()
})

describe('POST /createUser', () => {
  beforeEach(() => {
    mockedAxios.mockReset()
  })

  it('returns 400 when channel is missing', async () => {
    const res = await supertest(buildApp()).post('/createUser').send({ personalDetails: {} })
    expect(res.status).toBe(400)
  })

  it('retains client-supplied profileDetails and merges in server-derived fields', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, {}, captured)

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({
        personalDetails: basePersonalDetails,
        profileDetails: {
          additionalProperties: { tag: [] },
          employmentDetails: { pinCode: '600601' },
          personalDetails: {
            category: 'General',
            dob: '13-6-1998',
            domicileMedium: 'Malayalam',
            gender: 'Male',
          },
          professionalDetails: [{ designation: 'Scientist H', group: 'Group A' }],
        },
      })

    expect(res.status).toBe(200)
    const body = captured.createUserBody
    expect(body.profileDetails.personalDetails).toMatchObject({
      additionalProperties: {},
      category: 'General',
      dob: '13-6-1998',
      domicileMedium: 'Malayalam',
      firstname: basePersonalDetails.firstName,
      gender: 'Male',
      isNgo: false,
      mobile: 6161616161,
      phoneVerified: false,
      primaryEmail: basePersonalDetails.email,
    })
    expect(body.profileDetails.professionalDetails).toEqual([{ designation: 'Scientist H', group: 'Group A' }])
    expect(body.profileDetails.additionalProperties).toEqual({ tag: [] })
    expect(body.profileDetails.employmentDetails).toEqual({ pinCode: '600601' })
    expect(body.profileDetails.profileStatus).toBe('VERIFIED')
    expect(body.profileDetails.profileGroupStatus).toBe('VERIFIED')
    expect(body.profileDetails.profileDesignationStatus).toBe('VERIFIED')
    expect(res.body.userId).toBe('u1')
  })

  it('defaults isNgo and personalDetails.additionalProperties when neither source provides them', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, {}, captured)

    await supertest(buildApp())
      .post('/createUser')
      .send({ personalDetails: basePersonalDetails })

    expect(captured.createUserBody.profileDetails.personalDetails.isNgo).toBe(false)
    expect(captured.createUserBody.profileDetails.personalDetails.additionalProperties).toEqual({})
    expect(captured.createUserBody.profileDetails.profileStatus).toBe('NOT-VERIFIED')
  })

  it('omits phone and roles from the Kong payload when neither is supplied', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, {}, captured)

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({ personalDetails: { channel: 'Dept of Project management', email: 'nophone@yopmail.com', firstName: 'No Phone' } })

    expect(res.status).toBe(200)
    expect(captured.createUserBody.phone).toBeUndefined()
    expect(captured.createUserBody.roles).toBeUndefined()
    expect(captured.searchCalled).toBeUndefined()
  })

  it('overrides dob/gender/category/domicileMedium/pincode/tags/bpCoTrainer when provided at the flat personalDetails level', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, {}, captured)

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({
        personalDetails: {
          ...basePersonalDetails,
          bpCoTrainer: 'trainer-1',
          category: 'OBC',
          dob: '1-1-2000',
          domicileMedium: 'English',
          gender: 'Female',
          pincode: '560001',
          tags: ['tag1'],
        },
        profileDetails: {
          personalDetails: { category: 'General', dob: '13-6-1998' },
        },
      })

    expect(res.status).toBe(200)
    const personalDetails = captured.createUserBody.profileDetails.personalDetails
    expect(personalDetails.category).toBe('OBC')
    expect(personalDetails.dob).toBe('1-1-2000')
    expect(personalDetails.domicileMedium).toBe('English')
    expect(personalDetails.gender).toBe('Female')
    expect(personalDetails.pincode).toBe('560001')
    expect(personalDetails.tags).toEqual(['tag1'])
    expect(captured.createUserBody.profileDetails.additionalProperties).toEqual({ tag: ['tag1'] })
    expect(captured.createUserBody.profileDetails.bpCoTrainer).toBe('trainer-1')
  })

  it('merges a designation-only professionalDetails entry without a group', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, {}, captured)

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({ personalDetails: { ...basePersonalDetails, designation: 'Scientist H' } })

    expect(res.status).toBe(200)
    expect(captured.createUserBody.profileDetails.professionalDetails).toEqual([{ designation: 'Scientist H' }])
    expect(captured.createUserBody.profileDetails.profileStatus).toBe('NOT-VERIFIED')
  })

  it('merges a group-only professionalDetails entry without a designation', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, {}, captured)

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({ personalDetails: { ...basePersonalDetails, group: 'Group A' } })

    expect(res.status).toBe(200)
    expect(captured.createUserBody.profileDetails.professionalDetails).toEqual([{ group: 'Group A' }])
  })

  it('retains an incoming professionalDetails array as-is when no designation/group can be resolved', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, {}, captured)

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({
        personalDetails: basePersonalDetails,
        profileDetails: { professionalDetails: [{ note: 'no designation or group here' }] },
      })

    expect(res.status).toBe(200)
    expect(captured.createUserBody.profileDetails.professionalDetails).toEqual([{ note: 'no designation or group here' }])
  })

  it('overrides isNgo and personalDetails.additionalProperties when explicitly provided at the flat level', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, {}, captured)

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({
        personalDetails: { ...basePersonalDetails, additionalProperties: { note: 'flat' }, isNgo: true },
        profileDetails: { personalDetails: { additionalProperties: { note: 'incoming' }, isNgo: false } },
      })

    expect(res.status).toBe(200)
    expect(captured.createUserBody.profileDetails.personalDetails.isNgo).toBe(true)
    expect(captured.createUserBody.profileDetails.personalDetails.additionalProperties).toEqual({ note: 'flat' })
  })

  it('returns 500 for a malformed request body that has no personalDetails', async () => {
    const res = await supertest(buildApp()).post('/createUser').send({})
    expect(res.status).toBe(500)
  })

  it('returns 400 when designation conflicts between personalDetails and profileDetails.professionalDetails', async () => {
    const res = await supertest(buildApp())
      .post('/createUser')
      .send({
        personalDetails: { ...basePersonalDetails, designation: 'Scientist G' },
        profileDetails: {
          professionalDetails: [{ designation: 'Scientist H', group: 'Group A' }],
        },
      })

    expect(res.status).toBe(400)
    expect(res.body.params.errmsg).toMatch(/Conflicting designation/)
    expect(mockedAxios).not.toHaveBeenCalled()
  })

  it('returns 400 when group conflicts between personalDetails and profileDetails.professionalDetails', async () => {
    const res = await supertest(buildApp())
      .post('/createUser')
      .send({
        personalDetails: { ...basePersonalDetails, group: 'Group B' },
        profileDetails: {
          professionalDetails: [{ designation: 'Scientist H', group: 'Group A' }],
        },
      })

    expect(res.status).toBe(400)
    expect(res.body.params.errmsg).toMatch(/Conflicting group/)
    expect(mockedAxios).not.toHaveBeenCalled()
  })

  it('returns 400 when an MDO_LEADER already exists for the channel', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, { search: () => Promise.resolve({ data: { params: {}, result: { response: { count: 1 } } } }) }, captured)

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({ personalDetails: { ...basePersonalDetails, roles: ['PUBLIC', 'MDO_LEADER'] } })

    expect(res.status).toBe(400)
    expect(res.body.params.errmsg).toMatch(/MDO_LDEADER already exist/)
    expect(captured.searchCalled).toBe(true)
    expect(captured.createUserBody).toBeUndefined()
  })

  it('proceeds to create the user when no MDO_LEADER exists for the channel', async () => {
    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(mockedAxios, {}, captured)

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({ personalDetails: { ...basePersonalDetails, roles: ['PUBLIC', 'MDO_LEADER'] } })

    expect(res.status).toBe(200)
    expect(captured.searchCalled).toBe(true)
    expect(captured.createUserBody).toBeDefined()
  })

  it('passes through a CLIENT_ERROR from the MDO_LEADER search as a 400', async () => {
    setupAxiosMock(mockedAxios, {
      search: () => Promise.resolve({ data: { responseCode: 'CLIENT_ERROR', params: { errmsg: 'search failed' } } }),
    })

    const res = await supertest(buildApp())
      .post('/createUser')
      .send({ personalDetails: { ...basePersonalDetails, roles: ['PUBLIC', 'MDO_LEADER'] } })

    expect(res.status).toBe(400)
    expect(res.body.params.errmsg).toBe('search failed')
  })

  it('returns an error status when Kong rejects user creation', async () => {
    setupAxiosMock(mockedAxios, {
      create: () => Promise.reject({ response: { data: { params: { errmsg: 'boom' }, responseCode: 'SERVER_ERROR' } } }),
    })

    const res = await supertest(buildApp()).post('/createUser').send({ personalDetails: basePersonalDetails })

    expect(res.status).toBe(500)
    expect(res.body.params.errmsg).toBe('boom')
  })

  it('returns 400 when Kong responds with a CLIENT_ERROR on user creation', async () => {
    setupAxiosMock(mockedAxios, {
      create: () => Promise.resolve({ data: { responseCode: 'CLIENT_ERROR', params: { errmsg: 'invalid' } } }),
    })

    const res = await supertest(buildApp()).post('/createUser').send({ personalDetails: basePersonalDetails })

    expect(res.status).toBe(400)
    expect(res.body.params.errmsg).toBe('invalid')
  })

  it('returns 500 when reading the newly created user fails', async () => {
    setupAxiosMock(mockedAxios, {
      read: () => Promise.resolve({ data: { params: { status: 'FAILED' } } }),
    })

    const res = await supertest(buildApp()).post('/createUser').send({ personalDetails: basePersonalDetails })

    expect(res.status).toBe(500)
    expect(res.text).toMatch(/Failed to read newly created user details/)
  })

  it('returns 500 when the password reset fails', async () => {
    setupAxiosMock(mockedAxios, {
      passwordReset: () => Promise.resolve({ data: { params: { status: 'FAILED' } } }),
    })

    const res = await supertest(buildApp()).post('/createUser').send({ personalDetails: basePersonalDetails })

    expect(res.status).toBe(500)
    expect(res.text).toMatch(/Failed to reset the password for user/)
  })

  it('returns 500 when sending the welcome email fails', async () => {
    setupAxiosMock(mockedAxios, {
      welcomeEmail: () => Promise.resolve({ data: { params: { status: 'FAILED' } } }),
    })

    const res = await supertest(buildApp()).post('/createUser').send({ personalDetails: basePersonalDetails })

    expect(res.status).toBe(500)
    expect(res.text).toMatch(/Failed to send Welcome Email/)
  })

  it('creates a NodeBB account when PORTAL_CREATE_NODEBB_USER is enabled', async () => {
    process.env.PORTAL_CREATE_NODEBB_USER = 'true'
    // tslint:disable-next-line: no-any
    let isolatedAxios: any
    // tslint:disable-next-line: no-any
    let isolatedApi: any
    jest.isolateModules(() => {
      isolatedAxios = require('axios')
      // tslint:disable-next-line: no-var-requires
      isolatedApi = require('../../../../src/protectedApi_v8/user/profile-details-v2').profileDeatailsApi
    })
    delete process.env.PORTAL_CREATE_NODEBB_USER

    // tslint:disable-next-line: no-any
    const captured: any = {}
    setupAxiosMock(isolatedAxios, {}, captured)

    const res = await supertest(buildApp(isolatedApi)).post('/createUser').send({ personalDetails: basePersonalDetails })

    expect(res.status).toBe(200)
    expect(captured.nodebbCalled).toBe(true)
  })

  it('still returns 200 when NodeBB account creation fails', async () => {
    process.env.PORTAL_CREATE_NODEBB_USER = 'true'
    // tslint:disable-next-line: no-any
    let isolatedAxios: any
    // tslint:disable-next-line: no-any
    let isolatedApi: any
    jest.isolateModules(() => {
      isolatedAxios = require('axios')
      // tslint:disable-next-line: no-var-requires
      isolatedApi = require('../../../../src/protectedApi_v8/user/profile-details-v2').profileDeatailsApi
    })
    delete process.env.PORTAL_CREATE_NODEBB_USER

    setupAxiosMock(isolatedAxios, { nodebb: () => Promise.reject(new Error('nodebb down')) })

    const res = await supertest(buildApp(isolatedApi)).post('/createUser').send({ personalDetails: basePersonalDetails })

    expect(res.status).toBe(200)
  })
})

describe('POST /createUserRegistry', () => {
  it('creates a user registry', async () => {
    mockedAxiosPost.mockResolvedValue({ status: 200, data: { result: 'ok' } })
    const res = await supertest(buildApp()).post('/createUserRegistry').send({ firstname: 'A' })
    expect(res.status).toBe(200)
  })

  it('returns 500 on failure', async () => {
    mockedAxiosPost.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/createUserRegistry').send({})
    expect(res.status).toBe(500)
  })
})

describe('GET /getUserRegistry', () => {
  it('returns the registry', async () => {
    mockedAxiosPost.mockResolvedValue({ status: 200, data: { result: 'ok' } })
    const res = await supertest(buildApp()).get('/getUserRegistry')
    expect(res.status).toBe(200)
  })

  it('returns 500 on failure', async () => {
    mockedAxiosPost.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getUserRegistry')
    expect(res.status).toBe(500)
  })
})

describe('GET /getUserRegistryById/:id', () => {
  it('returns the registry for the given id', async () => {
    mockedAxiosPost.mockResolvedValue({ status: 200, data: { result: 'ok' } })
    const res = await supertest(buildApp()).get('/getUserRegistryById/other-id')
    expect(res.status).toBe(200)
  })

  it('returns 500 on failure', async () => {
    mockedAxiosPost.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getUserRegistryById/other-id')
    expect(res.status).toBe(500)
  })
})

describe('GET /userProfileStatus', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/userProfileStatus')
    expect(res.status).toBe(400)
  })

  it('returns the profile status', async () => {
    mockedAxiosPost.mockResolvedValue({ status: 200, data: { status: true } })
    const res = await supertest(buildApp()).get('/userProfileStatus').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
  })

  it('returns 500 on failure', async () => {
    mockedAxiosPost.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/userProfileStatus').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
  })
})

describe('POST /setUserProfileStatus', () => {
  it('sets the profile status', async () => {
    mockedAxiosPost.mockResolvedValue({ status: 200, data: { status: true } })
    const res = await supertest(buildApp()).post('/setUserProfileStatus').send({})
    expect(res.status).toBe(200)
  })

  it('returns 500 on failure', async () => {
    mockedAxiosPost.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/setUserProfileStatus').send({})
    expect(res.status).toBe(500)
  })
})

describe('GET /getMasterLanguages', () => {
  it('returns the languages list', async () => {
    mockedAxiosGet.mockResolvedValue({ status: 200, data: ['English'] })
    const res = await supertest(buildApp()).get('/getMasterLanguages')
    expect(res.status).toBe(200)
  })

  it('returns 500 on failure', async () => {
    mockedAxiosGet.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getMasterLanguages')
    expect(res.status).toBe(500)
  })
})

describe('GET /getMasterNationalities', () => {
  it('returns the nationalities list', async () => {
    mockedAxiosGet.mockResolvedValue({ status: 200, data: ['India'] })
    const res = await supertest(buildApp()).get('/getMasterNationalities')
    expect(res.status).toBe(200)
  })

  it('returns 500 on failure', async () => {
    mockedAxiosGet.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getMasterNationalities')
    expect(res.status).toBe(500)
  })
})

describe('GET /getProfilePageMeta', () => {
  it('returns the profile page meta', async () => {
    mockedAxiosGet.mockResolvedValue({ status: 200, data: { sections: [] } })
    const res = await supertest(buildApp()).get('/getProfilePageMeta')
    expect(res.status).toBe(200)
  })

  it('returns 500 on failure', async () => {
    mockedAxiosGet.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getProfilePageMeta')
    expect(res.status).toBe(500)
  })
})

describe('GET /migrateRegistry', () => {
  afterEach(() => {
    mockedReadFile.mockReset()
  })

  it('migrates the registry when the file reads successfully', async () => {
    // tslint:disable-next-line: no-any
    mockedReadFile.mockImplementation(((_path: any, cb: any) => {
      cb(null, JSON.stringify({ widList: ['w1'] }))
      // tslint:disable-next-line: no-any
    }) as any)
    mockedAxiosPost.mockResolvedValue({ status: 200, data: { result: 'ok' } })

    const res = await supertest(buildApp()).get('/migrateRegistry')
    expect(res.status).toBe(200)
  })

  it('returns 500 when the file read fails', async () => {
    // tslint:disable-next-line: no-any
    mockedReadFile.mockImplementation(((_path: any, cb: any) => {
      cb(new Error('no file'), null)
      // tslint:disable-next-line: no-any
    }) as any)

    const res = await supertest(buildApp()).get('/migrateRegistry')
    expect(res.status).toBe(500)
  })
})

describe('PATCH /updateUser', () => {
  it('updates the user profile', async () => {
    mockedAxiosPatch.mockResolvedValue({ status: 200, data: { updated: true } })
    const res = await supertest(buildApp()).patch('/updateUser').send({})
    expect(res.status).toBe(200)
  })

  it('returns a fallback error body when the failure has no response data', async () => {
    mockedAxiosPatch.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).patch('/updateUser').send({})
    expect(res.status).toBe(500)
    expect(res.body.error).toBeDefined()
  })

  it('passes through the response data from a failed update', async () => {
    mockedAxiosPatch.mockRejectedValue({ response: { status: 400, data: { error: 'bad' } } })
    const res = await supertest(buildApp()).patch('/updateUser').send({})
    expect(res.status).toBe(400)
    expect(res.body.error).toBe('bad')
  })
})

describe('POST /createUserV2WithRegistry', () => {
  it('returns 400 when channel is missing', async () => {
    const res = await supertest(buildApp()).post('/createUserV2WithRegistry').send({ personalDetails: {} })
    expect(res.status).toBe(400)
  })

  it('returns 400 when the email already exists', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 1 } } } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserV2WithRegistry')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(400)
  })

  it('creates the user and registry on success', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve({ data: { result: { userId: 'u1' } } })
      }
      if (config.url.includes('v1/user/read/')) {
        return Promise.resolve({ data: { params: { status: 'SUCCESS' }, result: { response: { userName: 'uname' } } } })
      }
      if (config.url.includes('v1/user/create/profile')) {
        return Promise.resolve({ data: { osid: 'os1' } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserV2WithRegistry')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(200)
    expect(res.body.userId).toBe('u1')
  })

  it('returns 400 when Kong create responds with CLIENT_ERROR', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve({ data: { responseCode: 'CLIENT_ERROR' } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserV2WithRegistry')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(400)
  })

  it('returns 500 when the created-user read fails', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve({ data: { result: { userId: 'u1' } } })
      }
      if (config.url.includes('v1/user/read/')) {
        return Promise.resolve({ data: { params: { status: 'FAILED' } } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserV2WithRegistry')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(500)
  })

  it('returns 500 when the registry could not be created in OpenSaber', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve({ data: { result: { userId: 'u1' } } })
      }
      if (config.url.includes('v1/user/read/')) {
        return Promise.resolve({ data: { params: { status: 'SUCCESS' }, result: { response: { userName: 'uname' } } } })
      }
      if (config.url.includes('v1/user/create/profile')) {
        return Promise.resolve({ data: null })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserV2WithRegistry')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(500)
  })
})

describe('POST /createUserV2WithoutRegistry', () => {
  it('returns 400 when channel is missing', async () => {
    const res = await supertest(buildApp()).post('/createUserV2WithoutRegistry').send({ personalDetails: {} })
    expect(res.status).toBe(400)
  })

  it('returns 400 when the email already exists', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 1 } } } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserV2WithoutRegistry')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(400)
  })

  it('creates the user on success', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve({ data: { result: { userId: 'u1' } } })
      }
      if (config.url.includes('v1/user/read/')) {
        return Promise.resolve({ data: { params: { status: 'SUCCESS' } } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserV2WithoutRegistry')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(200)
    expect(res.body.userId).toBe('u1')
  })

  it('returns 400 when Kong create responds with CLIENT_ERROR', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve({ data: { responseCode: 'CLIENT_ERROR' } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserV2WithoutRegistry')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(400)
  })

  it('returns 500 when the created-user read fails', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('private/user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v3/create')) {
        return Promise.resolve({ data: { result: { userId: 'u1' } } })
      }
      if (config.url.includes('v1/user/read/')) {
        return Promise.resolve({ data: { params: { status: 'FAILED' } } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserV2WithoutRegistry')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(500)
  })
})

describe('POST /createUserWithoutInvitationEmail', () => {
  it('returns 400 when channel is missing', async () => {
    const res = await supertest(buildApp()).post('/createUserWithoutInvitationEmail').send({ personalDetails: {} })
    expect(res.status).toBe(400)
  })

  it('returns 400 when the email already exists', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 1 } } } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserWithoutInvitationEmail')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(400)
    expect(res.body.responseCode).toBe('USR_EMAIL_EXISTS')
  })

  it('creates the user and updates the profile on success', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v5/create')) {
        return Promise.resolve({ data: { result: { userId: 'u1' } } })
      }
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve({ data: { params: { status: 'SUCCESS' } } })
      }
      if (config.url.includes('private/v1/update')) {
        return Promise.resolve({ data: { responseCode: 'OK' } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserWithoutInvitationEmail')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(200)
    expect(res.body.userId).toBe('u1')
  })

  it('returns 400 when Kong create responds with CLIENT_ERROR', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v5/create')) {
        return Promise.resolve({ data: { responseCode: 'CLIENT_ERROR' } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserWithoutInvitationEmail')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(400)
  })

  it('returns 500 when the created-user read fails', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v5/create')) {
        return Promise.resolve({ data: { result: { userId: 'u1' } } })
      }
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve({ data: { params: { status: 'FAILED' } } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserWithoutInvitationEmail')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(500)
  })

  it('returns 400 when the profile update responds with CLIENT_ERROR', async () => {
    // tslint:disable-next-line: no-any
    mockedAxios.mockImplementation((config: any) => {
      if (config.url.includes('user/v1/search')) {
        return Promise.resolve({ data: { result: { response: { count: 0 } } } })
      }
      if (config.url.includes('user/v5/create')) {
        return Promise.resolve({ data: { result: { userId: 'u1' } } })
      }
      if (config.url.includes('user/v2/read/')) {
        return Promise.resolve({ data: { params: { status: 'SUCCESS' } } })
      }
      if (config.url.includes('private/v1/update')) {
        return Promise.resolve({ data: { responseCode: 'CLIENT_ERROR' } })
      }
      return Promise.resolve({ data: {} })
    })
    const res = await supertest(buildApp())
      .post('/createUserWithoutInvitationEmail')
      .send({ personalDetails: { channel: 'Dept', email: 'a@b.com', firstName: 'A', lastName: 'B' } })
    expect(res.status).toBe(400)
  })
})
