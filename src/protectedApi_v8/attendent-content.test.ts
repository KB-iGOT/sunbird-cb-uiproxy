jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { attendedContentApi } from './attendent-content'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(attendedContentApi)
  return app
}

describe('attendedContentApi GET /attendedCourses', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/attendedCourses')
    expect(res.status).toBe(400)
  })

  it('wraps the upstream content list in a contents field', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ id: 'c1' }] })
    const res = await supertest(buildApp()).get('/attendedCourses').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ contents: [{ id: 'c1' }] })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining(`${CONSTANTS.ATTENDANCE_API_BASE}/v1/users/user-1/attended-content`),
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })

  it('falls back to the raw error when the request fails without a response', async () => {
    mockedAxios.get.mockRejectedValue({ message: 'down' })
    const res = await supertest(buildApp()).get('/attendedCourses').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ message: 'down' })
  })
})

describe('attendedContentApi GET /attendedUsers/:contentId', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/attendedUsers/content-1')
    expect(res.status).toBe(400)
  })

  it('returns the attended users for the given content', async () => {
    mockedAxios.get.mockResolvedValue({ data: [{ userId: 'user-1' }], status: 200 })
    const res = await supertest(buildApp()).get('/attendedUsers/content-1').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ userId: 'user-1' }])
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.ATTENDANCE_API_BASE}/v1/content/content-1/attended-users`,
      expect.any(Object)
    )
  })
})

describe('attendedContentApi GET /verifyAttendedUsers', () => {
  it('returns 400 when rootOrg header is missing', async () => {
    const res = await supertest(buildApp()).get('/verifyAttendedUsers?contentIds=content-1')
    expect(res.status).toBe(400)
  })

  it('verifies attendance for the extracted userId and given content ids', async () => {
    mockedAxios.get.mockResolvedValue({ data: { verified: true }, status: 200 })
    const res = await supertest(buildApp()).get('/verifyAttendedUsers?contentIds=c1,c2').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.ATTENDANCE_API_BASE}/v1/users/user-1/verify-attendence?content_id=c1,c2`,
      expect.any(Object)
    )
  })
})
