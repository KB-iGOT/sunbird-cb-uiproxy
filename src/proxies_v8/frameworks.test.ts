jest.mock('axios', () => jest.fn())

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { frameworksApi } from './frameworks'

const mockedAxios = axios as unknown as jest.Mock

// tslint:disable-next-line: no-any
function buildApp(session: any = {}) {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object; session?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    req.session = session
    next()
  })
  app.use(frameworksApi)
  return app
}

describe('frameworksApi passthrough (non create/update/publish urls)', () => {
  it('forwards a plain read request straight through to KONG', async () => {
    mockedAxios.mockResolvedValue({ data: { frameworks: [] }, status: 200 })
    const res = await supertest(buildApp({ rootOrgId: 'org-1', userRoles: [] })).get('/proxies/v8/framework/read/kcm_fw')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ frameworks: [] })
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: CONSTANTS.SB_API_KEY, 'X-Channel-Id': 'org-1' }),
        method: 'GET',
        url: `${CONSTANTS.KONG_API_BASE}/framework/read/kcm_fw`,
      })
    )
  })

  it('returns 500 with the error message when the upstream call fails', async () => {
    mockedAxios.mockRejectedValue(new Error('kong down'))
    const res = await supertest(buildApp({ rootOrgId: 'org-1', userRoles: [] })).get('/proxies/v8/framework/read/kcm_fw')
    expect(res.status).toBe(500)
    expect(res.text).toBe('kong down')
  })
})

describe('frameworksApi update/create gating on the master framework category', () => {
  it('blocks a user without the allowed role from updating a master-category framework', async () => {
    const res = await supertest(buildApp({ rootOrgId: 'org-1', userRoles: ['PUBLIC'] }))
      .put('/proxies/v8/framework/update/x?framework=kcm_fw')
      .send({})

    expect(res.status).toBe(401)
    expect(mockedAxios).not.toHaveBeenCalled()
  })

  it('allows a user with the allowed role to update a master-category framework', async () => {
    mockedAxios.mockResolvedValue({ data: {}, status: 200 })
    const res = await supertest(buildApp({ rootOrgId: 'org-1', userRoles: ['SPV_ADMIN'] }))
      .put('/proxies/v8/framework/update/x?framework=kcm_fw')
      .send({})

    expect(res.status).toBe(200)
    expect(mockedAxios).toHaveBeenCalled()
  })
})

describe('frameworksApi create/update gating on a foreign org', () => {
  it('blocks a user without the allowed role from touching another org\'s framework', async () => {
    const res = await supertest(buildApp({ rootOrgId: 'org-1', userRoles: ['PUBLIC'] }))
      .post('/proxies/v8/framework/create/x?framework=other_org')
      .send({})

    expect(res.status).toBe(401)
    expect(res.text).toContain('not authorized')
  })

  it('allows a user with the allowed role to touch another org\'s framework', async () => {
    mockedAxios.mockResolvedValue({ data: {}, status: 200 })
    const res = await supertest(buildApp({ rootOrgId: 'org-1', userRoles: ['SPV_ADMIN'] }))
      .post('/proxies/v8/framework/create/x?framework=other_org')
      .send({})

    expect(res.status).toBe(200)
  })

  it('allows any user to update their own org\'s (non-master-category) framework', async () => {
    mockedAxios.mockResolvedValue({ data: {}, status: 200 })
    const res = await supertest(buildApp({ rootOrgId: 'my_org', userRoles: [] }))
      .post('/proxies/v8/framework/create/x?framework=my_org')
      .send({})

    expect(res.status).toBe(200)
  })
})
