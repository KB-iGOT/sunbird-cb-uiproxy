jest.mock('axios')

import axios from 'axios'
import express from 'express'
import supertest from 'supertest'
import { navigatorApi } from './navigator'

const mockedAxios = axios as jest.Mocked<typeof axios>

function buildApp() {
  const app = express()
  app.use('/navigator', navigatorApi)
  return app
}

function armWithRole(armName: string) {
  return {
    arm_name: armName,
    roles: [
      {
        role_id: 'R1',
        role_image: '/role.png',
        variants: [{ variant_id: 'V1', variant_image: '/variant.png', group: [{ lp_groupimage: '/group.png' }] }],
      },
    ],
  }
}

// processRolesData() requires all five arm keys to be present or it throws
const nsoData = {
  nso_data: ['Accelerate', 'Experience', 'Innovate', 'Insight', 'Assure'].map(armWithRole),
}

describe('navigatorApi', () => {
  describe('GET /roles', () => {
    it('returns the roles data keyed by arm name, with proxied images', async () => {
      mockedAxios.get.mockResolvedValue({ data: nsoData })
      const res = await supertest(buildApp()).get('/navigator/roles')
      expect(res.status).toBe(200)
      expect(res.body.Accelerate.roles[0].role_id).toBe('R1')
    })

    it('returns 500 on failure', async () => {
      mockedAxios.get.mockRejectedValue(new Error('down'))
      const res = await supertest(buildApp()).get('/navigator/roles')
      expect(res.status).toBe(500)
    })
  })

  describe('GET /role/:roleId/:variantId', () => {
    it('returns the requested role variant', async () => {
      mockedAxios.get.mockResolvedValue({ data: nsoData })
      const res = await supertest(buildApp()).get('/navigator/role/R1/V1')
      expect(res.status).toBe(200)
      expect(res.body.variant_id).toBe('V1')
    })

    it('returns 404 for an unknown role id', async () => {
      mockedAxios.get.mockResolvedValue({ data: nsoData })
      const res = await supertest(buildApp()).get('/navigator/role/unknown/V1')
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Role Id incorrect' })
    })

    it('returns 404 for an unknown variant id', async () => {
      mockedAxios.get.mockResolvedValue({ data: nsoData })
      const res = await supertest(buildApp()).get('/navigator/role/R1/unknown')
      expect(res.status).toBe(404)
      expect(res.body).toEqual({ error: 'Variant Id incorrect' })
    })
  })

  describe('GET /lp', () => {
    it('treats a non-numeric pageNumber as 0 instead of rejecting it (Number(x) || 0 hides NaN)', async () => {
      mockedAxios.get.mockResolvedValue({ data: { lp_data: [{ lp_id: 1 }] } })
      const res = await supertest(buildApp()).get('/navigator/lp?pageNumber=abc')
      expect(res.status).toBe(200)
    })

    it('returns a page of learning paths', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { lp_data: [{ lp_id: 1, lp_image: '/lp.png' }] },
      })
      const res = await supertest(buildApp()).get('/navigator/lp')
      expect(res.status).toBe(200)
      expect(res.body[0].lp_id).toBe(1)
    })

    it('returns 400 when the page is out of range', async () => {
      mockedAxios.get.mockResolvedValue({ data: { lp_data: [{ lp_id: 1 }] } })
      const res = await supertest(buildApp()).get('/navigator/lp?pageNumber=5&pageSize=1')
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Out of Range Error.' })
    })

    it('filters learning paths by topic', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          lp_data: [
            { lp_id: 1, profiles: [{ technology: ['java'] }] },
            { lp_id: 2, profiles: [{ technology: ['python'] }] },
          ],
        },
      })
      const res = await supertest(buildApp()).get('/navigator/lp?topics=java')
      expect(res.status).toBe(200)
      expect(res.body.map((lp: { lp_id: number }) => lp.lp_id)).toEqual([1])
    })
  })

  describe('GET /lp/:lpId', () => {
    it('returns the matching learning path', async () => {
      mockedAxios.get.mockResolvedValue({ data: { lp_data: [{ lp_id: 7, lp_image: '/lp.png' }] } })
      const res = await supertest(buildApp()).get('/navigator/lp/7')
      expect(res.status).toBe(200)
      expect(res.body.lp_id).toBe(7)
    })

    it('returns 404 when no learning path matches', async () => {
      mockedAxios.get.mockResolvedValue({ data: { lp_data: [] } })
      const res = await supertest(buildApp()).get('/navigator/lp/missing')
      expect(res.status).toBe(404)
    })
  })

  describe('GET /fp', () => {
    it('treats a non-numeric pageSize as 0 instead of rejecting it (Number(x) || 0 hides NaN)', async () => {
      mockedAxios.get.mockResolvedValue({ data: { fs_data: [] } })
      const res = await supertest(buildApp()).get('/navigator/fp?pageSize=abc')
      expect(res.status).toBe(400)
      expect(res.body).toEqual({ error: 'Out of Range Error.' })
    })

    it('returns a page of full-stack data', async () => {
      mockedAxios.get.mockResolvedValue({ data: { fs_data: [{ fs_id: 1, fs_image: '/fs.png' }] } })
      const res = await supertest(buildApp()).get('/navigator/fp')
      expect(res.status).toBe(200)
      expect(res.body[0].fs_id).toBe(1)
    })

    it('returns 400 when the page is out of range', async () => {
      mockedAxios.get.mockResolvedValue({ data: { fs_data: [{ fs_id: 1 }] } })
      const res = await supertest(buildApp()).get('/navigator/fp?pageNumber=5&pageSize=1')
      expect(res.status).toBe(400)
    })
  })

  describe('GET /topics', () => {
    it('returns the distinct set of technologies', async () => {
      mockedAxios.get.mockResolvedValue({
        data: { lp_data: [{ profiles: [{ technology: ['java', 'java', 'python'] }] }] },
      })
      const res = await supertest(buildApp()).get('/navigator/topics')
      expect(res.status).toBe(200)
      expect(res.body.sort()).toEqual(['java', 'python'])
    })
  })

  describe('GET /bpm', () => {
    it('returns the bpm data', async () => {
      mockedAxios.get.mockResolvedValue({ data: { steps: [] } })
      const res = await supertest(buildApp()).get('/navigator/bpm')
      expect(res.status).toBe(200)
      expect(res.body).toEqual({ steps: [] })
    })
  })
})
