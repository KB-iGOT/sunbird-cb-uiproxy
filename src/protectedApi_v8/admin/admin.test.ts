jest.mock('./banner', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'bannerApi' }))
  return { bannerApi: router }
})

jest.mock('./userRegistration', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'userRegistrationApi' }))
  return { userRegistrationApi: router }
})

jest.mock('./userRoles', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'userRolesApi' }))
  return { userRolesApi: router }
})

import express from 'express'
import supertest from 'supertest'
import { admin } from './admin'

function buildApp() {
  const app = express()
  app.use('/admin', admin)
  return app
}

describe('admin router wiring', () => {
  it('mounts userRegistrationApi under /userRegistration', async () => {
    const res = await supertest(buildApp()).get('/admin/userRegistration/ping')
    expect(res.body).toEqual({ marker: 'userRegistrationApi' })
  })

  it('mounts bannerApi under /banners', async () => {
    const res = await supertest(buildApp()).get('/admin/banners/ping')
    expect(res.body).toEqual({ marker: 'bannerApi' })
  })

  it('mounts userRolesApi under /userRoles', async () => {
    const res = await supertest(buildApp()).get('/admin/userRoles/ping')
    expect(res.body).toEqual({ marker: 'userRolesApi' })
  })
})
