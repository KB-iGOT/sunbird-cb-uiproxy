jest.mock('axios', () => {
  const fn = jest.fn()
  // tslint:disable-next-line: no-any
  ;(fn as any).get = jest.fn()
  return fn
})

jest.mock('../utils/proxyCreator', () => ({
  createPooledProxy: jest.fn(() => ({
    on: jest.fn(),
    web: jest.fn((_req: never, res: { sendStatus: (n: number) => void }) => res.sendStatus(200)),
  })),
}))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../utils/env'
import { createPooledProxy } from '../utils/proxyCreator'
import { authContent } from './authContent'

const mockedAxios = axios as unknown as jest.Mock & { get: jest.Mock }
const mockedWeb = (createPooledProxy as jest.Mock).mock.results[0].value.web as jest.Mock

function buildApp() {
  const app = express()
  app.use(authContent)
  return app
}

describe('authContent GET /content-store/ routes', () => {
  it('rewrites an embedded external content-store url and proxies it to CONTENT_API_BASE', async () => {
    await supertest(buildApp()).get('/redirect/https://ext.example.com/content-store/abc/def/file.mp4')

    expect(mockedWeb).toHaveBeenCalledTimes(1)
    const [req, , options] = mockedWeb.mock.calls[0]
    expect(req.url).toBe('/contentv3/download/abc%2Fdef%2Ffile.mp4')
    expect(options).toEqual({ target: CONSTANTS.CONTENT_API_BASE })
  })

  it('serves an .html content-store resource directly via axios instead of proxying', async () => {
    mockedAxios.get.mockResolvedValue({ data: '<html>hi</html>' })
    const res = await supertest(buildApp()).get('/redirect/https://ext.example.com/content-store/abc/def/index.html')

    expect(res.status).toBe(200)
    expect(res.text).toBe('<html>hi</html>')
    expect(res.header['content-type']).toContain('text/html')
    expect(mockedWeb).not.toHaveBeenCalled()
    expect(mockedAxios.get).toHaveBeenCalledWith(
      CONSTANTS.CONTENT_API_BASE + '/contentv3/download/abc%2Fdef%2Findex.html',
      expect.any(Object)
    )
  })

  it('responds with the upstream error status/body when the .html fetch fails', async () => {
    mockedAxios.get.mockRejectedValue({ response: { data: { error: 'nope' }, status: 404 } })
    const res = await supertest(buildApp()).get('/redirect/https://ext.example.com/content-store/abc/index.html')
    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: 'nope' })
  })
})

describe('authContent GET fallback (external stream passthrough)', () => {
  it('streams the upstream response through when the request does not resolve to a content-store path', async () => {
    const pipeMock = jest.fn((destination: { end: () => void }) => destination.end())
    mockedAxios.mockResolvedValue({ data: { pipe: pipeMock } })

    await supertest(buildApp()).get('/some/unrelated/path')

    expect(mockedAxios).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', responseType: 'stream' }))
    expect(pipeMock).toHaveBeenCalled()
  })

  it('responds 500 when the upstream stream request fails', async () => {
    mockedAxios.mockRejectedValue(new Error('upstream down'))
    const res = await supertest(buildApp()).get('/some/unrelated/path')
    expect(res.status).toBe(500)
  })
})

describe('authContent POST routes', () => {
  it('rewrites a /publish/ url and proxies to CONTENT_API_BASE', async () => {
    await supertest(buildApp()).post('/publish/abc/def')
    const [req] = mockedWeb.mock.calls[mockedWeb.mock.calls.length - 1]
    expect(req.url).toBe('/contentv3/publish/abc%2Fdef')
  })

  it('rewrites an /upload-zip/ url and proxies to CONTENT_API_BASE', async () => {
    await supertest(buildApp()).post('/upload-zip/abc')
    const [req] = mockedWeb.mock.calls[mockedWeb.mock.calls.length - 1]
    expect(req.url).toBe('/contentv3/upload-zip/abc')
  })

  it('defaults to the /upload/ rewrite for any other path', async () => {
    await supertest(buildApp()).post('/upload/abc')
    const [req] = mockedWeb.mock.calls[mockedWeb.mock.calls.length - 1]
    expect(req.url).toBe('/contentv3/upload/abc')
  })

  it('leaves the url untouched for video-transcoding requests', async () => {
    await supertest(buildApp()).post('/video-transcoding/abc')
    const [req] = mockedWeb.mock.calls[mockedWeb.mock.calls.length - 1]
    expect(req.url).toBe('/video-transcoding/abc')
  })
})
