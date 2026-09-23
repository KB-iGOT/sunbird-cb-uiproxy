import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { jwtUserTokenHelper } from './jwtUserTokenHelper'

function buildApp(kauth?: object) {
  const app = express()
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    if (kauth) {
      req.kauth = kauth
    }
    next()
  })
  app.use(jwtUserTokenHelper)
  return app
}

describe('jwtUserTokenHelper', () => {
  it('returns the extracted user token for an authenticated request', async () => {
    const app = buildApp({ grant: { access_token: { token: 'the-token' } } })
    const res = await supertest(app).get('/anything')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ 'x-authenticated-user-token': 'the-token' })
  })

  it('returns undefined for the token when there is no kauth on the request', async () => {
    const app = buildApp()
    const res = await supertest(app).get('/anything')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({})
  })
})
