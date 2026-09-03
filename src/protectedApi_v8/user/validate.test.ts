import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { validateApi } from './validate'

function buildApp(kauth?: object) {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    if (kauth) {
      req.kauth = kauth
    }
    next()
  })
  app.use(validateApi)
  return app
}

describe('validateApi', () => {
  it('returns the extracted user details from an authenticated request', async () => {
    const res = await supertest(
      buildApp({
        grant: { access_token: { content: { email: 'jane@example.com', name: 'Jane Doe', sub: 'user-1' } } },
      })
    ).get('/')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ email: 'jane@example.com', name: 'Jane Doe', userId: 'user-1' })
  })

  it('falls back to demo values when there is no kauth on the request', async () => {
    const res = await supertest(buildApp()).get('/')
    expect(res.body).toEqual({ email: 'user@demo.com', name: 'demo user', userId: 'user@demo.com' })
  })
})
