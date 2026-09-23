jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { classDiagramApi } from './classDiagram'

const mockedAxios = axios as unknown as { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(classDiagramApi)
  return app
}

describe('classDiagramApi', () => {
  it('submits the class diagram for the extracted userId and content', async () => {
    mockedAxios.post.mockResolvedValue({ data: { submitted: true } })
    const res = await supertest(buildApp())
      .post('/classdiagram/submit/content-1')
      .set('rootOrg', 'igot')
      .send({ diagram: {} })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ submitted: true })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SUBMISSION_API_BASE}/v1/users/user-1/exercises/content-1/classdiagram-submission`,
      { diagram: {} },
      expect.objectContaining({ headers: { rootOrg: 'igot' } })
    )
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/classdiagram/submit/content-1').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
