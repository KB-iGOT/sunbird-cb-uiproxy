jest.mock('./posts', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'postsApi' }))
  return { postsApi: router }
})

jest.mock('./topics', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'topicsApi' }))
  return { topicsApi: router }
})

jest.mock('./tags', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'tagsApi' }))
  return { tagsApi: router }
})

jest.mock('./categories', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'categoriesApi' }))
  return { categoriesApi: router }
})

jest.mock('./notifications', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'notificationsApi' }))
  return { notificationsApi: router }
})

jest.mock('./users', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'usersApi' }))
  return { usersApi: router }
})

jest.mock('./writeApi', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'writeApi' }))
  return { writeApi: router }
})

import express from 'express'
import supertest from 'supertest'
import { discussionHubApi } from './discussionHub'

function buildApp() {
  const app = express()
  app.use('/discussion', discussionHubApi)
  return app
}

describe('discussionHubApi router wiring', () => {
  const cases: Array<[string, string]> = [
    ['/discussion/posts/ping', 'postsApi'],
    ['/discussion/topics/ping', 'topicsApi'],
    ['/discussion/tags/ping', 'tagsApi'],
    ['/discussion/categories/ping', 'categoriesApi'],
    ['/discussion/notifications/ping', 'notificationsApi'],
    ['/discussion/users/ping', 'usersApi'],
    ['/discussion/writeApi/v2/ping', 'writeApi'],
  ]

  it.each(cases)('mounts %s to the expected sub-router', async (path, marker) => {
    const res = await supertest(buildApp()).get(path)
    expect(res.body).toEqual({ marker })
  })
})
