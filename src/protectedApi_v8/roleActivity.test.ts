jest.mock('axios')

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { ERROR } from '../utils/message'
import { roleActivityApi } from './roleActivity'

const mockedAxios = axios as jest.Mocked<typeof axios>

function buildApp() {
  const app = express()
  app.use('/roleActivity', roleActivityApi)
  return app
}

describe('roleActivityApi', () => {
  describe('GET /', () => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).get('/roleActivity/')
      expect(res.status).toBe(400)
      expect(res.text).toBe(ERROR.ERROR_NO_ORG_DATA)
    })

    it('returns the static list of roles', async () => {
      const res = await supertest(buildApp()).get('/roleActivity/').set('rootOrg', 'igot')
      expect(res.status).toBe(200)
      expect(Array.isArray(res.body)).toBe(true)
      expect(res.body[0].id).toBe('RID001')
      expect(res.body[0].childNodes.length).toBe(2)
    })
  })

  describe('GET /:roleKey', () => {
    it('returns 400 without a rootOrg header', async () => {
      const res = await supertest(buildApp()).get('/roleActivity/IT')
      expect(res.status).toBe(400)
    })

    it('maps FRAC search results into roles, keeping only ACTIVITY children', async () => {
      mockedAxios.post.mockResolvedValue({
        data: {
          responseData: [
            {
              children: [
                { description: 'a', id: 'AID1', name: 'Activity 1', source: 'ISTM', status: 'VERIFIED', type: 'ACTIVITY' },
                { description: 'b', id: 'RID2', name: 'Sub Role', source: 'ISTM', status: 'VERIFIED', type: 'ROLE' },
              ],
              description: 'IT role',
              id: 'RID001',
              name: 'Information Technology',
              source: 'ISTM',
              status: 'VERIFIED',
              type: 'ROLE',
            },
          ],
        },
      })

      const res = await supertest(buildApp())
        .get('/roleActivity/Information Technology')
        .set('rootOrg', 'igot')

      expect(res.status).toBe(200)
      expect(res.body).toEqual([
        {
          childNodes: [
            { description: 'a', id: 'AID1', name: 'Activity 1', parentRole: '', source: 'ISTM', status: 'VERIFIED', type: 'ACTIVITY' },
          ],
          description: 'IT role',
          id: 'RID001',
          name: 'Information Technology',
          source: 'ISTM',
          status: 'VERIFIED',
          type: 'ROLE',
        },
      ])
    })

    it('returns roles with empty childNodes when a role has no children', async () => {
      mockedAxios.post.mockResolvedValue({
        data: { responseData: [{ description: 'd', id: 'RID9', name: 'No children', source: 'ISTM', status: 'VERIFIED', type: 'ROLE' }] },
      })
      const res = await supertest(buildApp()).get('/roleActivity/No children').set('rootOrg', 'igot')
      expect(res.body[0].childNodes).toEqual([])
    })

    it('returns 500 with a fallback error when the upstream call fails', async () => {
      mockedAxios.post.mockRejectedValue(new Error('down'))
      const res = await supertest(buildApp()).get('/roleActivity/IT').set('rootOrg', 'igot')
      expect(res.status).toBe(500)
      expect(res.body).toEqual({ error: ERROR.GENERAL_ERR_MSG })
    })
  })
})
