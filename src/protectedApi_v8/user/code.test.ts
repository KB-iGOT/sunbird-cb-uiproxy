jest.mock('axios', () => {
  // tslint:disable-next-line: no-any
  const fn: any = jest.fn()
  fn.post = jest.fn()
  return fn
})

import axios from 'axios'
import express, { NextFunction, Request, Response } from 'express'
import supertest from 'supertest'
import { CONSTANTS } from '../../utils/env'
import { checkForBlockedStatement, codeApi, execute, verifySubmit, viewLastSubmission } from './code'

const mockedAxios = axios as unknown as jest.Mock & { post: jest.Mock }

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req: Request & { kauth?: object }, _res: Response, next: NextFunction) => {
    req.kauth = { grant: { access_token: { content: { sub: 'user-1' }, token: 'tok' } } }
    next()
  })
  app.use(codeApi)
  return app
}

describe('checkForBlockedStatement', () => {
  it('returns null for a non-python (language !== 16) submission', () => {
    expect(checkForBlockedStatement({ body: { code: 'import os', language: 71 } })).toBeNull()
  })

  it('returns a rejection payload when a restricted python statement is present', () => {
    // tslint:disable-next-line: no-any
    const originalRestricted = require('../../utils/env').RESTRICTED_PYTHON_STMT as string[]
    originalRestricted.push('import\\s+os')
    const result = checkForBlockedStatement({ body: { code: 'import os', language: 16 } })
    expect(result).toMatchObject({ errors: 'Forbidden statements found in the code', langid: 16 })
    originalRestricted.pop()
  })

  it('returns null when python code has no restricted statements', () => {
    expect(checkForBlockedStatement({ body: { code: 'print(1)', language: 16 } })).toBeNull()
  })
})

describe('execute', () => {
  it('posts the compile request with the LEX client credentials', async () => {
    mockedAxios.post.mockResolvedValue({ data: { output: 'ok' } })
    const result = await execute({ code: 'print(1)' } as never)
    expect(result).toEqual({ output: 'ok' })
    expect(mockedAxios.post).toHaveBeenCalledWith(
      `${CONSTANTS.IAP_CODE_API_BASE}/backend/Code/Compile`,
      expect.objectContaining({ clientId: 'LEX', code: 'print(1)' }),
      expect.any(Object)
    )
  })

  it('returns an empty object when the compile call fails', async () => {
    mockedAxios.post.mockRejectedValue(new Error('down'))
    expect(await execute({} as never)).toEqual({})
  })
})

describe('verifySubmit', () => {
  it('posts to the resolved endpoint for the given verify/submit type', async () => {
    mockedAxios.mockResolvedValue({ data: { result: 'pass' } })
    const result = await verifySubmit('fpSubmit', 'lex-1', 'user-1', {} as never, 'igot')
    expect(result).toEqual({ result: 'pass' })
    expect(mockedAxios).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('/exercises/lex-1/python-submission?type=submit') })
    )
  })
})

describe('viewLastSubmission', () => {
  it('rewrites private-cdn submission urls in the response', async () => {
    mockedAxios.mockResolvedValue({ data: { response: [{ submission_url: 'http://private-a.example.com/f.py' }] } })
    const result: never = await viewLastSubmission('lex-1', 'user-1', 'igot') as never
    // tslint:disable-next-line: no-any
    expect((result as any).response[0].submission_url).toBe('/apis/proxies/v8/f.py')
  })
})

describe('codeApi POST /execute', () => {
  it('rejects forbidden python code without calling the compiler', async () => {
    // tslint:disable-next-line: no-any
    const originalRestricted = require('../../utils/env').RESTRICTED_PYTHON_STMT as string[]
    originalRestricted.push('import\\s+os')
    const res = await supertest(buildApp()).post('/execute').send({ code: 'import os', language: 16 })
    expect(res.status).toBe(200)
    expect(res.body.errors).toContain('Forbidden')
    expect(mockedAxios.post).not.toHaveBeenCalled()
    originalRestricted.pop()
  })

  it('executes and returns the compiler output', async () => {
    mockedAxios.post.mockResolvedValue({ data: { output: 'ok' } })
    const res = await supertest(buildApp()).post('/execute').send({ code: 'print(1)', language: 71 })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ output: 'ok' })
  })
})

describe('codeApi GET /viewLastSubmission/:contentId', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).get('/viewLastSubmission/lex-1')
    expect(res.status).toBe(400)
  })

  it('returns the last submission', async () => {
    mockedAxios.mockResolvedValue({ data: { response: [] } })
    const res = await supertest(buildApp()).get('/viewLastSubmission/lex-1').set('org', 'dopt').set('rootOrg', 'igot')
    expect(res.status).toBe(200)
  })
})

describe('codeApi POST /:group/:action/:contentId', () => {
  it('returns 400 when org/rootOrg headers are missing', async () => {
    const res = await supertest(buildApp()).post('/fp/submit/lex-1').send({})
    expect(res.status).toBe(400)
  })

  it('verifies/submits the exercise for the given group/action', async () => {
    mockedAxios.mockResolvedValue({ data: { result: 'pass' } })
    const res = await supertest(buildApp()).post('/fp/submit/lex-1').set('org', 'dopt').set('rootOrg', 'igot').send({})
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ result: 'pass' })
  })
})
