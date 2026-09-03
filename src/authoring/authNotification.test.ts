jest.mock('../utils/proxyCreator', () => ({
  createPooledProxy: jest.fn(() => ({ web: jest.fn((_req: never, res: { sendStatus: (n: number) => void }) => res.sendStatus(200)) })),
}))

import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { createPooledProxy } from '../utils/proxyCreator'
import { authNotification } from './authNotification'

const mockedWeb = (createPooledProxy as jest.Mock).mock.results[0].value.web as jest.Mock

describe('authNotification', () => {
  it('strips the /authNotificationApi prefix from req.url and proxies to NOTIFICATIONS_API_BASE', async () => {
    const app = express()
    app.use(authNotification)

    await supertest(app).get('/authNotificationApi/some/path')

    expect(mockedWeb).toHaveBeenCalledTimes(1)
    const [req, , options] = mockedWeb.mock.calls[0]
    expect(req.url).toBe('/some/path')
    expect(options).toEqual({ target: CONSTANTS.NOTIFICATIONS_API_BASE })
  })
})
