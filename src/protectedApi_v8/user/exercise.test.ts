jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }))
jest.mock('form-data', () => {
  return jest.fn().mockImplementation(() => ({
    append: jest.fn(),
    submit: jest.fn(),
  }))
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import fileUpload from 'express-fileupload'
import FormData from 'form-data'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { exerciseApi } from './exercise'

const mockedAxios = axios as unknown as { get: jest.Mock; post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(fileUpload())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(exerciseApi)
  return app
}

describe('exerciseApi GET /getSubmissions', () => {
  it('rewrites private-cdn submission urls in the response', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { response: [{ submission_url: 'http://private-abc.example.com/f.pdf' }] },
    })
    const res = await supertest(buildApp()).get('/getSubmissions?contentId=c1&type=file')
    expect(res.status).toBe(200)
    expect(res.body.response[0].submission_url).toBe('/apis/proxies/v8/f.pdf')
    expect(mockedAxios.get).toHaveBeenCalledWith(
      `${CONSTANTS.SB_EXT_API_BASE_3}/v1/users/user-1/exercises/c1/submissions?type=file`,
      expect.any(Object)
    )
  })

  it('falls back to a generic 500 error when the fetch fails', async () => {
    mockedAxios.get.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).get('/getSubmissions')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('exerciseApi POST /postsubmission/:contentId', () => {
  it('posts the submission for the extracted userId', async () => {
    mockedAxios.post.mockResolvedValue({ data: { submitted: true } })
    const res = await supertest(buildApp()).post('/postsubmission/c1').send({ answer: 'x' })
    expect(res.status).toBe(200)
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.SUBMISSION_API_BASE}/v1/users/user-1/exercises/c1/submissions`,
      { answer: 'x' },
      expect.any(Object)
    )
  })
})

describe('exerciseApi POST /createContentDirectory/:contentId', () => {
  // NOTE: the success branch of this handler calls `res.status(response.status)` and never
  // calls .send()/.end(), so the HTTP response is never actually flushed to the client — a
  // real bug (every successful call hangs until the caller's own client-side timeout). We pin
  // that behavior here with a short client timeout instead of asserting a response that never
  // arrives, rather than either hanging the suite or silently working around the bug.
  it('never responds on success, due to the missing res.send()/.end() call', async () => {
    mockedAxios.post.mockResolvedValue({ data: {}, status: 200 })
    await expect(
      supertest(buildApp()).post('/createContentDirectory/c1').timeout(300).send({})
    ).rejects.toThrow()
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.CONTENT_API_BASE}/content/submissions/c1`,
      {},
      expect.any(Object)
    )
  })

  it('falls back to a generic 500 error when creation fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    const res = await supertest(buildApp()).post('/createContentDirectory/c1').send({})
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Failed due to unknown reason' })
  })
})

describe('exerciseApi POST /uploadFileToContentDirectory/:contentId', () => {
  it('returns 500 when no file is present on the request', async () => {
    const res = await supertest(buildApp()).post('/uploadFileToContentDirectory/c1')
    expect(res.status).toBe(500)
  })

  it('uploads the file via form-data submit and forwards the parsed response', async () => {
    // tslint:disable-next-line: no-any
    const mockFormInstance: any = {
      append: jest.fn(),
      submit: jest.fn((_url: string, cb: (err: unknown, response: unknown) => void) => {
        const fakeResponse = {
          on: (event: string, handler: (chunk: Buffer) => void) => {
            if (event === 'data') {
              handler(Buffer.from(JSON.stringify({ uploaded: true })))
            }
          },
          statusCode: 200,
        }
        cb(null, fakeResponse)
      }),
    }
    const mockedFormDataCtor = FormData as unknown as jest.Mock
    mockedFormDataCtor.mockImplementation(() => mockFormInstance)

    const res = await supertest(buildApp())
      .post('/uploadFileToContentDirectory/c1')
      .attach('file', Buffer.from('hello'), 'hello.txt')

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ uploaded: true })
  })
})
