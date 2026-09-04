jest.mock('./editor', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'editorApi' }))
  return { editorApi: router }
})

import express from 'express'
import supertest from 'supertest'
import { api } from './index'

describe('authoring apis router wiring', () => {
  it('mounts editorApi under /editor', async () => {
    const app = express()
    app.use('/apis', api)
    const res = await supertest(app).get('/apis/editor/ping')
    expect(res.body).toEqual({ marker: 'editorApi' })
  })
})
