jest.mock('../../../src/utils/custom-keycloak', () => ({
  deauthenticateKeycloakSession: jest.fn().mockResolvedValue(undefined),
}))

import express from 'express'
import supertest from 'supertest'
import { isAllowed } from '../../../src/utils/apiWhiteList'
import { CONSTANTS } from '../../../src/utils/env'
import { ROLE } from '../../../src/utils/roles'
import { API_LIST } from '../../../src/utils/whitelistApis'

interface IOrgHierarchyRouteCase {
  method: 'get' | 'patch' | 'post'
  pattern: string
  samplePath: string
}

const ALLOWED_ROLES = [
  ROLE.STATE_ADMIN,
  ROLE.SPV_ADMIN,
  ROLE.SPV_PUBLISHER,
  ROLE.MDO_LEADER,
  ROLE.MDO_ADMIN,
]

const ORG_HIERARCHY_ROUTES: IOrgHierarchyRouteCase[] = [
  {
    method: 'get',
    pattern: '/proxies/v8/org/v2/hierarchy/:orgId/complete',
    samplePath: '/proxies/v8/org/v2/hierarchy/org-123/complete',
  },
  {
    method: 'post',
    pattern: '/proxies/v8/org/v2/hierarchy/read/:orgId',
    samplePath: '/proxies/v8/org/v2/hierarchy/read/org-123',
  },
  {
    method: 'post',
    pattern: '/proxies/v8/org/v2/hierarchy/link',
    samplePath: '/proxies/v8/org/v2/hierarchy/link',
  },
  {
    method: 'post',
    pattern: '/proxies/v8/org/v2/hierarchy/unlink',
    samplePath: '/proxies/v8/org/v2/hierarchy/unlink',
  },
  {
    method: 'post',
    pattern: '/proxies/v8/org/v2/hierarchy/move',
    samplePath: '/proxies/v8/org/v2/hierarchy/move',
  },
  {
    method: 'post',
    pattern: '/proxies/v8/org/v2/hierarchy/bulk/link/:rootOrgId',
    samplePath: '/proxies/v8/org/v2/hierarchy/bulk/link/root-org-1',
  },
  {
    method: 'patch',
    pattern: '/proxies/v8/org/v2/hierarchy/levels/:rootOrgId',
    samplePath: '/proxies/v8/org/v2/hierarchy/levels/root-org-1',
  },
]

function buildApp(userRoles: string[]) {
  const app = express()
  app.use((req, _res, next) => {
    // tslint:disable-next-line: no-any
    const mutableReq = req as any
    mutableReq.session = { userRoles }
    next()
  })
  app.use(isAllowed())
  app.all('*', (_req, res) => {
    res.status(200).json({ allowed: true })
  })
  return app
}

function sendRequest(app: express.Application, method: 'get' | 'patch' | 'post', url: string) {
  if (method === 'get') {
    return supertest(app).get(url)
  }
  if (method === 'patch') {
    return supertest(app).patch(url)
  }
  return supertest(app).post(url)
}

describe('org hierarchy whitelist and isAllowed middleware', () => {
  const mutableConstants = CONSTANTS as { PORTAL_API_WHITELIST_CHECK: string }
  const originalWhitelistCheck = mutableConstants.PORTAL_API_WHITELIST_CHECK

  beforeEach(() => {
    mutableConstants.PORTAL_API_WHITELIST_CHECK = 'true'
  })

  afterEach(() => {
    mutableConstants.PORTAL_API_WHITELIST_CHECK = originalWhitelistCheck
  })

  it('registers all 7 org hierarchy endpoints in API_LIST.URL and API_LIST.URL_PATTERN', () => {
    const urlMap = API_LIST.URL as Record<string, { ROLE_CHECK: string[], checksNeeded: string[] }>

    ORG_HIERARCHY_ROUTES.forEach((route) => {
      const entry = urlMap[route.pattern]
      expect(entry).toBeDefined()
      expect(entry.checksNeeded).toEqual(['ROLE_CHECK'])
      expect(entry.ROLE_CHECK).toEqual(ALLOWED_ROLES)
      expect(API_LIST.URL_PATTERN).toContain(route.pattern)
    })
  })

  it('allows each configured org hierarchy role to access all 7 endpoints', async () => {
    for (const route of ORG_HIERARCHY_ROUTES) {
      for (const role of ALLOWED_ROLES) {
        const res = await sendRequest(buildApp([role]), route.method, route.samplePath)
        expect(res.status).toBe(200)
        expect(res.body).toEqual({ allowed: true })
      }
    }
  })

  it('rejects PUBLIC role and empty roles with 403 for all 7 endpoints', async () => {
    for (const route of ORG_HIERARCHY_ROUTES) {
      for (const userRoles of [[ROLE.PUBLIC], [] as string[]]) {
        const res = await sendRequest(buildApp(userRoles), route.method, route.samplePath)
        expect(res.status).toBe(403)
        expect(res.body.responseCode).toBe('FORBIDDEN')
        expect(res.body.params.err).toBe('FORBIDDEN_ERROR')
      }
    }
  })

  it('rejects unwhitelisted org hierarchy paths with 403 even for an admin role', async () => {
    const res = await sendRequest(buildApp([ROLE.MDO_ADMIN]), 'get', '/proxies/v8/org/v2/hierarchy/unknown/path')
    expect(res.status).toBe(403)
    expect(res.body.responseCode).toBe('FORBIDDEN')
  })
})

