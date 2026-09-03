jest.mock('axios', () => ({ post: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { skillsApi } from './skills'

const mockedAxios = axios as unknown as { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(skillsApi)
  return app
}

describe('skillsApi POST /autocomplete', () => {
  it('forwards the query and locale headers to the authoring backend', async () => {
    mockedAxios.post.mockResolvedValue({ data: ['java', 'javascript'] })
    const res = await supertest(buildApp())
      .post('/autocomplete')
      .set('rootOrg', 'igot')
      .set('org', 'dopt')
      .set('locale', 'en')
      .send({ q: 'ja' })

    expect(res.status).toBe(200)
    expect(res.body).toEqual(['java', 'javascript'])
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.AUTHORING_BACKEND}/action/meta/v1/skills`,
      { q: 'ja' },
      expect.objectContaining({ headers: { langCode: 'en', org: 'dopt', rootOrg: 'igot' } })
    )
  })

  it('falls back to a generic 500 error when the failure has no response', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/autocomplete').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})
