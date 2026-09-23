jest.mock('axios')
jest.mock('../content', () => ({ getMultipleContent: jest.fn() }))

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { ERROR } from '../../utils/message'
import { getMultipleContent } from '../content'
import { fetchLikedIdsResponse, userContentApi } from './content'

const mockedAxios = axios as jest.Mocked<typeof axios>
const mockedAxiosFn = axios as unknown as jest.Mock
const mockedGetMultipleContent = getMultipleContent as jest.Mock

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use('/user', userContentApi)
  return app
}

describe('userContentApi', () => {
  describe('POST /contentLikes', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).post('/user/contentLikes').send({})
      expect(res.status).toBe(400)
      expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
    })

    it('forwards to the content-like-count endpoint', async () => {
      mockedAxios.post.mockResolvedValue({ data: { count: 3 }, status: 200 })
      const res = await supertest(buildApp())
        .post('/user/contentLikes')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .send({ contentIds: ['c1'] })
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ count: 3 })
    })

    it('returns the upstream error status/body on failure', async () => {
      mockedAxios.post.mockRejectedValue({ response: { data: { error: 'bad' }, status: 422 } })
      const res = await supertest(buildApp())
        .post('/user/contentLikes')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .send({})
      expect(res.status).toBe(422)
      expect(res.body).toEqual({ error: 'bad' })
    })
  })

  describe('GET /like', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).get('/user/like')
      expect(res.status).toBe(400)
    })

    it('returns the liked ids for the user', async () => {
      mockedAxiosFn.mockResolvedValue({ data: ['c1', 'c2'] } as never)
      const res = await supertest(buildApp())
        .get('/user/like')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual(['c1', 'c2'])
    })

    it('returns 500 on axios rejection', async () => {
      mockedAxiosFn.mockRejectedValue({ response: { data: { error: 'oops' }, status: 500 } } as never)
      const res = await supertest(buildApp())
        .get('/user/like')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /like/contents', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).get('/user/like/contents')
      expect(res.status).toBe(400)
    })

    it('fetches liked ids then resolves their content', async () => {
      mockedAxiosFn.mockResolvedValue({ data: ['c1'] } as never)
      mockedGetMultipleContent.mockResolvedValue([{ identifier: 'c1' }])
      const res = await supertest(buildApp())
        .get('/user/like/contents')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ contents: [{ identifier: 'c1' }], hasMore: false })
      expect(mockedGetMultipleContent).toHaveBeenCalledWith(['c1'], 'igot', 'igotOrg', 'user-1')
    })
  })

  describe('POST /like/:contentId', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).post('/user/like/c1').send({})
      expect(res.status).toBe(400)
    })

    it('likes the content', async () => {
      mockedAxiosFn.mockResolvedValue({ data: { liked: true } } as never)
      const res = await supertest(buildApp())
        .post('/user/like/c1')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
        .send({})
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ liked: true })
    })
  })

  describe('DELETE /unlike/:contentId', () => {
    it('returns 400 without org/rootOrg headers', async () => {
      const res = await supertest(buildApp()).delete('/user/unlike/c1')
      expect(res.status).toBe(400)
    })

    it('unlikes the content', async () => {
      mockedAxiosFn.mockResolvedValue({ data: { liked: false } } as never)
      const res = await supertest(buildApp())
        .delete('/user/unlike/c1')
        .set('org', 'igotOrg')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ liked: false })
    })
  })

  describe('GET /assigned-content', () => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).get('/user/assigned-content')
      expect(res.status).toBe(400)
    })

    it('returns processed assigned content', async () => {
      mockedAxiosFn.mockResolvedValue({
        data: { assignedContents: [{ identifier: 'c1', appIcon: '/icon.png' }] },
      } as never)
      const res = await supertest(buildApp())
        .get('/user/assigned-content')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(200)
      expect(res.body.hasMore).toBe(false)
      expect(res.body.contents[0].identifier).toBe('c1')
    })

    it('returns 500 on failure', async () => {
      mockedAxiosFn.mockRejectedValue(new Error('down') as never)
      const res = await supertest(buildApp())
        .get('/user/assigned-content')
        .set('rootOrg', 'igot')
        .set('wid', 'user-1')
      expect(res.status).toBe(500)
    })
  })
})

describe('fetchLikedIdsResponse', () => {
  it('rejects with a wrapped error when the axios call fails', async () => {
    mockedAxiosFn.mockRejectedValue(new Error('boom') as never)
    const req = { header: () => 'user-1', kauth: undefined } as never
    await expect(fetchLikedIdsResponse(req, 'igot', 'igotOrg')).rejects.toThrow('Error: boom')
  })
})
