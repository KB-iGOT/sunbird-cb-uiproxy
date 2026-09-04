jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.get = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import {
  getUserDetailsFromApi,
  getUserDetailsFromGraph,
  getUserProfile,
  profileApi,
} from './profile'

const mockedAxios = axios as unknown as jest.Mock & { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = {
      grant: { access_token: { content: { email: 'jane@example.com', name: 'Jane Doe', sub: 'user-1' }, token: 'tok' } },
    }
    next()
  })
  app.use(profileApi)
  return app
}

describe('getUserDetailsFromApi', () => {
  it('returns the upstream details on success', async () => {
    mockedAxios.get.mockResolvedValue({ data: { email: 'a@b.com', name: 'Jane' } })
    expect(await getUserDetailsFromApi('user-1')).toEqual({ email: 'a@b.com', name: 'Jane' })
  })

  it('returns null when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    expect(await getUserDetailsFromApi('user-1')).toBeNull()
  })
})

describe('getUserDetailsFromGraph', () => {
  it('returns the nested graph response on success', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { response: { givenName: 'Jane' } } } })
    expect(await getUserDetailsFromGraph('user-1')).toEqual({ givenName: 'Jane' })
  })

  it('returns null when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    expect(await getUserDetailsFromGraph('user-1')).toBeNull()
  })
})

describe('getUserProfile', () => {
  it('merges details and graph responses, preferring details for name/email', async () => {
    mockedAxios.get.mockImplementation((url: string) => {
      if (url.includes('/v2/Users')) {
        return Promise.resolve({ data: { result: { response: { companyName: '42', onPremisesUserPrincipalName: 'graph@x.com' } } } })
      }
      return Promise.resolve({ data: { email: 'details@x.com', empNumber: 1, name: 'Details Name' } })
    })

    // tslint:disable-next-line: no-any
    const req: any = { header: () => undefined, kauth: { grant: { access_token: { content: {} } } } }
    // tslint:disable-next-line: no-any
    const result = await getUserProfile('user-1', req) as any

    expect(result.email).toBe('details@x.com')
    expect(result.name).toBe('Details Name')
    expect(result.miscellaneous.empNumber).toBe(42)
  })

  it('still returns a (mostly empty) profile shape when both lookups fail, since each swallows its own error', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    // tslint:disable-next-line: no-any
    const req: any = { header: () => undefined }
    // getUserDetailsFromApi/getUserDetailsFromGraph each catch their own axios error and
    // resolve to null rather than rejecting, so getUserProfile's own try/catch never
    // triggers here — it falls through to manipulateResult(null, null, ...).
    expect(await getUserProfile('user-1', req)).toEqual({ email: undefined, miscellaneous: { empNumber: 0 }, name: null })
  })
})

describe('profileApi routes', () => {
  it('GET /empDB returns the api details', async () => {
    mockedAxios.get.mockResolvedValue({ data: { name: 'Jane' } })
    const res = await supertest(buildApp()).get('/empDB')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ name: 'Jane' })
  })

  it('GET /graph returns the graph details', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { response: { givenName: 'Jane' } } } })
    const res = await supertest(buildApp()).get('/graph')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ givenName: 'Jane' })
  })

  it('GET /graph/photo/:userEmail returns the profile photo payload', async () => {
    mockedAxios.get.mockResolvedValue({ data: { photo: 'base64' } })
    const res = await supertest(buildApp()).get('/graph/photo/jane@example.com')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE}/v1/Users/jane@example.com/Photo`,
      expect.any(Object)
    )
  })

  it('GET / returns the merged user profile', async () => {
    mockedAxios.get.mockResolvedValue({ data: { name: 'Jane' } })
    const res = await supertest(buildApp()).get('/')
    expect(res.status).toBe(200)
  })

  it('PATCH / creates a new user acceptance record', async () => {
    mockedAxios.mockResolvedValue({ data: { created: true }, status: 200 })
    const res = await supertest(buildApp()).patch('/').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ created: true })
  })

  it('PATCH / returns 404 when there is no kauth token content', async () => {
    const app = express()
    app.use(express.json())
    app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
      req.kauth = undefined
      next()
    })
    app.use(profileApi)
    const res = await supertest(app).patch('/').send({})
    expect(res.status).toBe(404)
  })
})
