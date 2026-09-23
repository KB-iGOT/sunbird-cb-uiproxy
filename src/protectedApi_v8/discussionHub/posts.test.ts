jest.mock('axios', () => ({ get: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { postsApi } from './posts'

const mockedAxios = axios as unknown as { get: jest.Mock }

function buildApp() {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'f:org:user-1' }, token: 'tok' } } }
    next()
  })
  app.use(postsApi)
  return app
}

describe('postsApi', () => {
  it('fetches recent posts for the given search term and forwards rootOrg', async () => {
    mockedAxios.get.mockResolvedValue({ data: { posts: [] } })

    const res = await supertest(buildApp()).get('/karma').set('rootOrg', 'igot')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ posts: [] })
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.DISCUSSION_HUB_API_BASE}/nodebb/api/recent/posts/karma`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: CONSTANTS.SB_API_KEY, rootOrg: 'igot' }),
      })
    )
  })

  it('forwards the upstream error status/body when the request fails', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'boom' }, status: 404 } })
    const res = await supertest(buildApp()).get('/missing')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'boom' })
  })
})
