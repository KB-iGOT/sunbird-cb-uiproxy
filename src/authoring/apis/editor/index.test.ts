import express from 'express'
import supertest from 'supertest'
import { editorApi } from './index'

describe('editorApi', () => {
  it('is a pass-through router (no routes registered yet)', async () => {
    const app = express()
    app.use(editorApi)
    app.use((_req, fallbackRes) => fallbackRes.status(200).send('reached-fallback'))
    const res = await supertest(app).get('/anything')
    expect(res.status).toBe(200)
    expect(res.text).toBe('reached-fallback')
  })
})
