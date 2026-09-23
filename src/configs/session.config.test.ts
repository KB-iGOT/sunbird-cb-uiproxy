jest.mock('cassandra-store', () => jest.fn().mockImplementation(() => ({ __mockCassandraStore: true })))

import expressSession from 'express-session'
import { CONSTANTS } from '../utils/env'

// tslint:disable-next-line: no-any
function loadSessionConfigModule(): any {
  let mod: unknown
  jest.isolateModules(() => {
    // tslint:disable-next-line: no-var-requires
    mod = require('./session.config')
  })
  return mod
}

describe('getSessionConfig', () => {
  it('builds a session config backed by a cassandra store by default', () => {
    const { getSessionConfig } = loadSessionConfigModule()
    const config = getSessionConfig()
    expect(config.store).toEqual(expect.objectContaining({ __mockCassandraStore: true }))
    expect(config.resave).toBe(false)
    expect(config.saveUninitialized).toBe(false)
    expect(config.cookie).toEqual({ maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL })
  })

  it('builds an in-memory store when isPersistant is false', () => {
    const config = loadSessionConfigModule().getSessionConfig(false)
    // jest.isolateModules gives session.config.ts its own copy of express-session, so
    // compare by constructor name rather than `instanceof` against the outer import.
    expect(config.store.constructor.name).toBe(expressSession.MemoryStore.name)
  })

  it('memoizes the config across calls, ignoring the isPersistant argument after the first call', () => {
    const { getSessionConfig } = loadSessionConfigModule()
    const first = getSessionConfig()
    const second = getSessionConfig(false)
    expect(second).toBe(first)
  })
})
