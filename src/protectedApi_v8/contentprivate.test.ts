jest.mock('axios', () => ({ get: jest.fn(), patch: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { contentPrivateApi, getHierarchyDetails, getUserChannel } from './contentprivate'

const mockedAxios = axios as unknown as { get: jest.Mock; patch: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'f:org:user-1' }, token: 'tok' } } }
    next()
  })
  app.use(contentPrivateApi)
  return app
}

describe('getHierarchyDetails', () => {
  it('returns the channel from the hierarchy content', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { content: { channel: 'ch-1' } } } })
    expect(await getHierarchyDetails('tok', 'do_1')).toBe('ch-1')
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.KNOWLEDGE_MW_API_BASE}/action/content/v3/hierarchy/do_1?mode=edit`,
      expect.any(Object)
    )
  })

  it('returns a fallback string when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    expect(await getHierarchyDetails('tok', 'do_1')).toBe('contentSourceDetails')
  })
})

describe('getUserChannel', () => {
  it('returns the rootOrgId from the user profile response', async () => {
    mockedAxios.get.mockResolvedValue({ data: { result: { response: { rootOrgId: 'org-1' } } } })
    expect(await getUserChannel('tok', 'user-1')).toBe('org-1')
  })

  it('returns a fallback string when the request fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    expect(await getUserChannel('tok', 'user-1')).toBe('userChannelDetails')
  })
})

describe('contentPrivateApi PATCH /update/:id', () => {
  it('returns 400 NO_USER_ID when the extracted user id is empty', async () => {
    const app = express()
    app.use(express.json())
    app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
      req.kauth = { grant: { access_token: { content: { sub: 'f:org:' }, token: 'tok' } } }
      next()
    })
    app.use(contentPrivateApi)
    const res = await supertest(app).patch('/update/do_1').send({ request: { content: { versionKey: 'v1' } } })
    expect(res.status).toBe(400)
    expect(res.text).toContain('NO_USER_ID')
  })

  it('rejects the update when the user channel does not match the content source channel', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { result: { response: { rootOrgId: 'user-org' } } } })
      .mockResolvedValueOnce({ data: { result: { content: { channel: 'other-org' } } } })

    const res = await supertest(buildApp()).patch('/update/do_1').send({ request: { content: { versionKey: 'v1' } } })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ msg: 'SOURCE_MISMATCH_ERROR' })
    expect(mockedAxios.patch).not.toHaveBeenCalled()
  })

  it('updates the content when the user and source channels match', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { result: { response: { rootOrgId: 'same-org' } } } })
      .mockResolvedValueOnce({ data: { result: { content: { channel: 'same-org' } } } })
    mockedAxios.patch.mockResolvedValue({ data: { updated: true }, status: 200 })

    const res = await supertest(buildApp()).patch('/update/do_1').send({ request: { content: { versionKey: 'v1' } } })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ updated: true })
    expect(mockedAxios.patch).toHaveBeenCalledWith(
      `${CONSTANTS.KONG_API_BASE}/private/content/v3/update/do_1`,
      expect.any(Object),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-authenticated-user-token': 'tok' }) })
    )
  })
})
