jest.mock('../utils/proxyCreator', () => ({
  createPooledProxy: jest.fn(() => ({ web: jest.fn((_req: never, res: { sendStatus: (n: number) => void }) => res.sendStatus(200)) })),
}))

import express from 'express'
import supertest from 'supertest'
import { createPooledProxy } from '../utils/proxyCreator'
import { CONSTANTS } from '../utils/env'
import { authIapBackend } from './authIapBackend'

const mockedWeb = (createPooledProxy as jest.Mock).mock.results[0].value.web as jest.Mock

describe('authIapBackend', () => {
  it('strips the /authIapApi prefix from req.url and proxies to IAP_BACKEND_AUTH', async () => {
    const app = express()
    app.use(authIapBackend)

    await supertest(app).get('/authIapApi/some/path')

    expect(mockedWeb).toHaveBeenCalledTimes(1)
    const [req, , options] = mockedWeb.mock.calls[0]
    expect(req.url).toBe('/some/path')
    expect(options).toEqual({ changeOrigin: true, target: CONSTANTS.IAP_BACKEND_AUTH })
  })
})
