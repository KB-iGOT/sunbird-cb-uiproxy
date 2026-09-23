jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.post = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { autocompleteApi } from './auto-complete'

const mockedAxios = axios as unknown as jest.Mock & { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(autocompleteApi)
  return app
}

describe('autocompleteApi POST /department/:query', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).post('/department/eng').send({})
    expect(res.status).toBe(400)
  })

  it('searches users by department', async () => {
    mockedAxios.post.mockResolvedValue({ data: [{ name: 'Jane' }] })
    const res = await supertest(buildApp()).post('/department/eng').set('org', 'dopt').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ name: 'Jane' }])
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.USER_PROFILE_API_BASE}/user/autocomplete/igot/department/eng`,
      {},
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })
})

describe('autocompleteApi GET /:query', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/jane')
    expect(res.status).toBe(400)
  })

  it('searches users by autocomplete string', async () => {
    mockedAxios.mockResolvedValue({ data: [{ name: 'Jane' }] })
    const res = await supertest(buildApp()).get('/jane').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
    expect(res.body).toEqual([{ name: 'Jane' }])
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: CONSTANTS.SB_API_KEY, rootOrg: 'igot' }),
        method: 'GET',
        url: expect.stringContaining('searchString=jane'),
      })
    )
  })

  it('falls back to a generic 500 error when the search fails', async () => {
    mockedAxios.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/jane').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
