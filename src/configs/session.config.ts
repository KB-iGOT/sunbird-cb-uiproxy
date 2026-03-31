import cassandraDriver from 'cassandra-driver'
import cassandraStore from 'cassandra-store'
import expressSession from 'express-session'
import { CONSTANTS } from '../utils/env'
const expressCassandra = require('express-cassandra')
const _ = require('lodash')

let sessionConfig: expressSession.SessionOptions
const consistency = getConsistencyLevel(
  CONSTANTS.PORTAL_CASSANDRA_CONSISTENCY_LEVEL === 'one'
    ? 'quorum'
    : CONSTANTS.PORTAL_CASSANDRA_CONSISTENCY_LEVEL
)

const cassandraClientOptions: cassandraDriver.ClientOptions = {
  contactPoints: getIPList(),
  keyspace: 'portal',
  queryOptions: {
    consistency,
    prepare: true,
  },
}

function getIPList() {
  return CONSTANTS.CASSANDRA_IP.split(',')
}

if (
  CONSTANTS.IS_CASSANDRA_AUTH_ENABLED &&
  CONSTANTS.CASSANDRA_USERNAME &&
  CONSTANTS.CASSANDRA_PASSWORD
) {
  cassandraClientOptions.authProvider = new cassandraDriver.auth.PlainTextAuthProvider(
    CONSTANTS.CASSANDRA_USERNAME,
    CONSTANTS.CASSANDRA_PASSWORD
  )
}

// tslint:disable-next-line: no-any
export function interceptStore(store: any) {
  const originalSet = store.set.bind(store)
  // tslint:disable-next-line: no-any
  store.set = (sid: string, session: any, callback: any) => {
    // Prevent saving completely empty sessions or recursive callback loops
    // which generate 403s and bloat Cassandra with zombie rows.
    if (session) {
      const keys = Object.keys(session).filter((k) => k !== 'cookie')
      if (
        keys.length === 0 ||
        (keys.length === 1 &&
          keys.includes('auth_redirect_uri') &&
          session.auth_redirect_uri &&
          session.auth_redirect_uri.includes('auth_callback='))
      ) {
        if (callback) {
          return callback()
        }
        return
      }
    }
    return originalSet(sid, session, callback)
  }
}

export function getSessionConfig(
  isPersistant = true
): expressSession.SessionOptions {
  if (!sessionConfig) {
    const store = isPersistant
      ? new cassandraStore({
        client: null,
        clientOptions: cassandraClientOptions,
        table: 'sessions',
      })
      : new expressSession.MemoryStore()

    interceptStore(store)

    sessionConfig = {
      cookie: {
        maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
      },
      resave: false,
      saveUninitialized: false,
      secret: 'test',
      store,
    }
  }
  return sessionConfig
}

// tslint:disable-next-line: no-any
function getConsistencyLevel(consistencyParam: any) {
  // tslint:disable-next-line: max-line-length
  return (consistencyParam && _.get(expressCassandra, `consistencies.${consistencyParam}`) ? _.get(expressCassandra, `consistencies.${consistencyParam}`) : expressCassandra.consistencies.quorum)
}
