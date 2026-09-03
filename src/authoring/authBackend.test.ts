jest.mock('../utils/proxyCreator', () => ({
  createPooledProxy: jest.fn(() => ({ web: jest.fn((_req: never, res: { sendStatus: (n: number) => void }) => res.sendStatus(200)) })),
}))

import express from 'express'
import supertest from 'supertest'
import { createPooledProxy } from '../utils/proxyCreator'
import { CONSTANTS } from '../utils/env'
import { authBackend } from './authBackend'

const mockedWeb = (createPooledProxy as jest.Mock).mock.results[0].value.web as jest.Mock

describe('authBackend', () => {
  it('strips the /authApi prefix from req.url and proxies to AUTHORING_BACKEND', async () => {
    // Mounted at root so req.url still carries the /authApi segment the handler strips.
    const app = express()
    app.use(authBackend)

    await supertest(app).get('/authApi/some/path')

    expect(mockedWeb).toHaveBeenCalledTimes(1)
    const [req, , options] = mockedWeb.mock.calls[0]
    expect(req.url).toBe('/some/path')
    expect(options).toEqual({ target: CONSTANTS.AUTHORING_BACKEND })
  })
})
