jest.mock('axios')

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { designationMetaFrac, getProfileStatus, profileRegistryApi } from './profile-registry'

const mockedAxios = axios as jest.Mocked<typeof axios>

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/profileRegistry', profileRegistryApi)
  return app
}

describe('profileRegistryApi', () => {
  describe('POST /createUserRegistry', () => {
    it('updates an existing registry when a profile already exists', async () => {
      mockedAxios.get.mockResolvedValue({ data: { result: { UserProfile: [{ userId: 'u1' }] } } })
      mockedAxios.post.mockResolvedValue({ data: { updated: true }, status: 200 })
      const res = await supertest(buildApp())
        .post('/profileRegistry/createUserRegistry')
        .set('wid', 'u1')
        .send({ firstname: 'A' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ updated: true })
      expect(mockedAxios.post.mock.calls[0][0]).toContain('/update/profile')
    })

    it('creates a new registry when no profile exists', async () => {
      mockedAxios.get.mockResolvedValue({ data: { result: { UserProfile: [] } } })
      mockedAxios.post.mockResolvedValue({ data: { created: true }, status: 201 })
      const res = await supertest(buildApp())
        .post('/profileRegistry/createUserRegistry')
        .set('wid', 'u1')
        .send({ firstname: 'A' })
      expect(res.status).toBe(201)
      expect(res.body).toEqual({ created: true })
      expect(mockedAxios.post.mock.calls[0][0]).toContain('/create/profile')
    })

    it('returns 500 on failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('down'))
      const res = await supertest(buildApp())
        .post('/profileRegistry/createUserRegistry')
        .set('wid', 'u1')
        .send({})
      expect(res.status).toBe(500)
    })
  })

  describe('POST /updateUserRegistry', () => {
    it('updates the registry', async () => {
      mockedAxios.post.mockResolvedValue({ data: { updated: true }, status: 200 })
      const res = await supertest(buildApp())
        .post('/profileRegistry/updateUserRegistry')
        .set('wid', 'u1')
        .send({ firstname: 'A' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ updated: true })
    })
  })

  describe('POST /updateUserWorkflowRegistry', () => {
    it('updates the workflow registry', async () => {
      mockedAxios.post.mockResolvedValue({ data: { updated: true }, status: 200 })
      const res = await supertest(buildApp())
        .post('/profileRegistry/updateUserWorkflowRegistry')
        .set('wid', 'u1')
        .send({})
      expect(res.status).toBe(200)
    })
  })

  describe('GET /getUserRegistry/:osid', () => {
    it('returns the registry for the given osid', async () => {
      mockedAxios.post.mockResolvedValue({ data: { osid: 'os1' }, status: 200 })
      const res = await supertest(buildApp()).get('/profileRegistry/getUserRegistry/os1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ osid: 'os1' })
    })
  })

  describe('GET /getUserRegistryById', () => {
    it('returns the registry for the current user', async () => {
      mockedAxios.get.mockResolvedValue({ data: { userId: 'u1' }, status: 200 })
      const res = await supertest(buildApp()).get('/profileRegistry/getUserRegistryById').set('wid', 'u1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ userId: 'u1' })
    })
  })

  describe('POST /searchUserRegistry', () => {
    it('returns search results', async () => {
      mockedAxios.post.mockResolvedValue({ data: { results: [] }, status: 200 })
      const res = await supertest(buildApp())
        .post('/profileRegistry/searchUserRegistry')
        .set('wid', 'u1')
        .send({ query: 'x' })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ results: [] })
    })
  })

  describe('GET /getUserRegistryByUser/:id', () => {
    it('uses the path id when provided', async () => {
      mockedAxios.get.mockResolvedValue({ data: { userId: 'other' }, status: 200 })
      const res = await supertest(buildApp()).get('/profileRegistry/getUserRegistryByUser/other')
      expect(res.status).toBe(200)
      expect(mockedAxios.get.mock.calls[0][0]).toContain('userId=other')
    })
  })

  describe('GET /getMasterNationalities', () => {
    it('returns the nationalities list', async () => {
      mockedAxios.get.mockResolvedValue({ data: ['India'] })
      const res = await supertest(buildApp()).get('/profileRegistry/getMasterNationalities')
      expect(res.status).toBe(200)
      expect(res.body).toEqual(['India'])
    })

    it('returns a fallback error on failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('down'))
      const res = await supertest(buildApp()).get('/profileRegistry/getMasterNationalities')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /getMasterCountries', () => {
    it('returns the countries list', async () => {
      mockedAxios.get.mockResolvedValue({ data: ['India'] })
      const res = await supertest(buildApp()).get('/profileRegistry/getMasterCountries')
      expect(res.status).toBe(200)
    })
  })

  describe('GET /getMasterLanguages', () => {
    it('returns the languages list', async () => {
      mockedAxios.get.mockResolvedValue({ data: ['English'] })
      const res = await supertest(buildApp()).get('/profileRegistry/getMasterLanguages')
      expect(res.status).toBe(200)
    })
  })

  describe('GET /getProfilePageMeta', () => {
    it('returns the profile page meta', async () => {
      mockedAxios.get.mockResolvedValue({ data: { sections: [] } })
      const res = await supertest(buildApp()).get('/profileRegistry/getProfilePageMeta')
      expect(res.status).toBe(200)
    })
  })

  describe('POST /createUserRegistryV2/:userId', () => {
    it('updates when a profile already exists', async () => {
      mockedAxios.get.mockResolvedValue({ data: { result: { UserProfile: [{ userId: 'u2' }] } } })
      mockedAxios.post.mockResolvedValue({ data: { updated: true }, status: 200 })
      const res = await supertest(buildApp()).post('/profileRegistry/createUserRegistryV2/u2').send({})
      expect(res.status).toBe(200)
      expect(mockedAxios.post.mock.calls[0][0]).toContain('/update/profile')
    })

    it('creates when no profile exists', async () => {
      mockedAxios.get.mockResolvedValue({ data: { result: { UserProfile: [] } } })
      mockedAxios.post.mockResolvedValue({ data: { created: true }, status: 201 })
      const res = await supertest(buildApp()).post('/profileRegistry/createUserRegistryV2/u2').send({})
      expect(res.status).toBe(201)
      expect(mockedAxios.post.mock.calls[0][0]).toContain('/create/profile')
    })
  })
})

describe('getProfileStatus', () => {
  const completePersonalDetails = {
    category: 'gen',
    dob: '2000-01-01',
    domicileMedium: 'en',
    firstname: 'A',
    gender: 'M',
    maritalStatus: 'single',
    mobile: '9999999999',
    nationality: 'IN',
    pincode: '110001',
    postalAddress: 'addr',
    primaryEmail: 'a@b.com',
    surname: 'B',
  }

  it('returns true when the profile belongs to the user and all required fields are present', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { result: { UserProfile: [{ userId: 'u1', personalDetails: completePersonalDetails }] } },
    })
    await expect(getProfileStatus('u1')).resolves.toBe(true)
  })

  it('returns false when a required field is missing', async () => {
    mockedAxios.get.mockResolvedValue({
      data: {
        result: {
          UserProfile: [{ userId: 'u1', personalDetails: { ...completePersonalDetails, mobile: '' } }],
        },
      },
    })
    await expect(getProfileStatus('u1')).resolves.toBe(false)
  })

  it('returns false when there is no matching profile', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { UserProfile: [] } } })
    await expect(getProfileStatus('u1')).resolves.toBe(false)
  })

  it('returns false on failure', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    await expect(getProfileStatus('u1')).resolves.toBe(false)
  })
})

describe('designationMetaFrac', () => {
  it('resolves the mapped position list', async () => {
    mockedAxios.get.mockResolvedValue({ data: { responseData: [{ name: 'Officer' }] } })
    const req = { header: () => undefined, kauth: undefined } as never
    await expect(designationMetaFrac(req)).resolves.toEqual([{ name: 'Officer' }])
  })

  it('rejects when there is no responseData', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} })
    const req = { header: () => undefined, kauth: undefined } as never
    await expect(designationMetaFrac(req)).rejects.toBe('Failed to receive response from FRAC API for designations')
  })
})
