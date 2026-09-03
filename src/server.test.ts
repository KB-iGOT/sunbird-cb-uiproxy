jest.mock('./protectedApi_v8/protectedApiV8', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'protectedApiV8' }))
  router.get('/throw', () => {
    throw new Error('kaboom')
  })
  return { protectedApiV8: router }
})

jest.mock('./proxies_v8/proxies_v8', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'proxiesV8' }))
  return { proxiesV8: router }
})

jest.mock('./publicApi_v8/publicApiV8', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'publicApiV8' }))
  return { publicApiV8: router }
})

jest.mock('./authoring/authContent', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  router.get('/ping', (_req: never, res: { json: (b: object) => void }) => res.json({ marker: 'authContent' }))
  return { authContent: router }
})

jest.mock('./authoring/authNotification', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  return { authNotification: router }
})

jest.mock('./authoring/authIapBackend', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  return { authIapBackend: router }
})

jest.mock('./authoring/authSearch', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  return { authSearch: router }
})

jest.mock('./authoring/content', () => {
  // tslint:disable-next-line: no-var-requires
  const expressLib = require('express')
  const router = expressLib.Router()
  return { authApi: router }
})

jest.mock('./configs/session.config', () => ({
  getSessionConfig: jest.fn(() => ({
    resave: false,
    saveUninitialized: false,
    secret: 'test-secret',
    // tslint:disable-next-line: no-var-requires
    store: new (require('express-session').MemoryStore)(),
  })),
}))

jest.mock('./configs/framework.config', () => ({}))

jest.mock('@project-sunbird/ext-framework-server/api', () => ({
  frameworkAPI: { bootstrap: jest.fn().mockResolvedValue({}) },
}))

jest.mock('./utils/logLevelControl', () => ({
  getLogLevelHandler: jest.fn((_req: never, res: { json: (b: object) => void }) => res.json({ current: 'info' })),
  resetLogLevelHandler: jest.fn(async (_req: never, res: { json: (b: object) => void }) => {
    res.json({ current: 'info' })
  }),
  setLogLevelHandler: jest.fn(async (_req: never, res: { json: (b: object) => void }) => {
    res.json({ current: 'debug' })
  }),
  startLogLevelSync: jest.fn(),
}))

jest.mock('./utils/apiWhiteList', () => {
  const state = { allow: true }
  return {
    __whitelistState: state,
    apiWhiteListLogger: () => (_req: never, _res: never, next: () => void) => next(),
    // tslint:disable-next-line: no-any
    isAllowed: () => (_req: any, res: any, next: any) => {
      if (state.allow) {
        next()
      } else {
        res.sendStatus(403)
      }
    },
  }
})

jest.mock('./utils/custom-keycloak', () => {
  const authState = { authenticated: true }
  return {
    __keycloakAuthState: authState,
    CustomKeycloak: jest.fn().mockImplementation(() => ({
      // tslint:disable-next-line: no-any
      middleware: (_req: any, _res: any, next: any) => next(),
      // tslint:disable-next-line: no-any
      protect: (_req: any, res: any, next: any) => {
        if (authState.authenticated) {
          next()
        } else {
          res.sendStatus(401)
        }
      },
    })),
  }
})

import express from 'express'
import supertest from 'supertest'
import { Server } from './server'
import { CONSTANTS } from './utils/env'

// tslint:disable-next-line: no-var-requires
const { __whitelistState } = require('./utils/apiWhiteList')
// tslint:disable-next-line: no-var-requires
const { __keycloakAuthState } = require('./utils/custom-keycloak')

function buildServerInstance() {
  // The constructor is private; bypass it the same way the class itself does via bootstrap().
  // tslint:disable-next-line: no-any
  return new (Server as any)()
}

describe('Server', () => {
  afterEach(() => {
    __whitelistState.allow = true
    __keycloakAuthState.authenticated = true
    // tslint:disable-next-line: no-any
    ;(CONSTANTS as any).PORTAL_API_WHITELIST_CHECK = 'true'
  })

  it('mounts the public API router under /public/v8', async () => {
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/public/v8/ping')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ marker: 'publicApiV8' })
  })

  it('mounts /authz without requiring keycloak protection', async () => {
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/authz')
    // No cookie/kauth present -> authzApi returns 401, but the important thing is it was reached at all
    expect(res.status).toBe(401)
  })

  it('mounts protected routes behind keycloak.protect', async () => {
    __keycloakAuthState.authenticated = false
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const blocked = await supertest(instance.app).get('/protected/v8/ping')
    expect(blocked.status).toBe(401)

    __keycloakAuthState.authenticated = true
    const allowed = await supertest(instance.app).get('/protected/v8/ping')
    expect(allowed.status).toBe(200)
    expect(allowed.body).toEqual({ marker: 'protectedApiV8' })
  })

  it('mounts proxy routes behind keycloak.protect', async () => {
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/proxies/v8/ping')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ marker: 'proxiesV8' })
  })

  it('mounts authoring routes behind keycloak.protect', async () => {
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/authContent/ping')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ marker: 'authContent' })
  })

  it('blocks all requests when the API whitelist rejects them', async () => {
    __whitelistState.allow = false
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/public/v8/ping')
    expect(res.status).toBe(403)
  })

  it('skips the whitelist check middleware entirely when PORTAL_API_WHITELIST_CHECK is disabled', async () => {
    __whitelistState.allow = false
    // tslint:disable-next-line: no-any
    ;(CONSTANTS as any).PORTAL_API_WHITELIST_CHECK = 'false'
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/public/v8/ping')
    // isAllowed() is never registered, so the "block everything" state has no effect
    expect(res.status).toBe(200)
  })

  it('redirects /reset to /apis/logout', async () => {
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/reset')
    expect(res.status).toBe(302)
    expect(res.header.location).toBe('/apis/logout')
  })

  it('exposes the log-level admin endpoints behind keycloak.protect', async () => {
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/protected/v8/internal/log-level')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ current: 'info' })
  })

  it('returns a generic 500 via the global error handler when a downstream route throws', async () => {
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/protected/v8/throw')
    expect(res.status).toBe(500)
    expect(res.body).toEqual({ error: 'Internal Server Error' })
  })

  it('responds 404 for an entirely unknown route once whitelisted through', async () => {
    // tslint:disable-next-line: no-any
    const instance: any = buildServerInstance()
    const res = await supertest(instance.app).get('/public/v8/does-not-exist')
    expect(res.status).toBe(404)
  })
})

describe('Server.bootstrap', () => {
  it('starts listening on the configured port', () => {
    const fakeHttpServer = { on: jest.fn() }
    const listenSpy = jest
      .spyOn(express.application, 'listen')
      // tslint:disable-next-line: no-any
      .mockImplementation(function(this: any, ...args: any[]) {
        const cb = args.find((a) => typeof a === 'function')
        if (cb) {
          cb()
        }
        return fakeHttpServer as never
      })

    expect(() => Server.bootstrap()).not.toThrow()
    expect(listenSpy).toHaveBeenCalledWith(CONSTANTS.PORTAL_PORT, '0.0.0.0', expect.any(Function))

    listenSpy.mockRestore()
  })
})
