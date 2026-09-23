import { CONSTANTS } from '../utils/env'

describe('framework.config', () => {
  // tslint:disable-next-line: no-var-requires
  const config = require('./framework.config')

  it('configures the cassandra contact points from CONSTANTS.CASSANDRA_IP', () => {
    expect(config.db.cassandra.contactPoints).toEqual(CONSTANTS.CASSANDRA_IP.split(','))
  })

  it('configures the default keyspace replication factor from CONSTANTS', () => {
    expect(config.db.cassandra.defaultKeyspaceSettings.replication).toEqual({
      class: 'SimpleStrategy',
      replication_factor: CONSTANTS.CASSANDRA_REPLICATION_FORM || 3,
    })
  })

  it('registers the form-service plugin', () => {
    expect(config.plugins).toEqual(expect.arrayContaining([{ id: '@project-sunbird/form-service', ver: '1.0' }]))
  })

  it('configures telemetry with the SB API key as a bearer token', () => {
    expect(config.telemetry.authtoken).toBe('Bearer ' + CONSTANTS.SB_API_KEY)
    expect(config.telemetry.host).toBe(CONSTANTS.TELEMETRY_SB_BASE)
    expect(config.telemetry.pdata.pid).toBe('sunbird-cb-uiproxy')
  })

  it('sets a non-empty telemetry uid', () => {
    expect(typeof config.telemetry.uid).toBe('string')
    expect(config.telemetry.uid.length).toBeGreaterThan(0)
  })
})
