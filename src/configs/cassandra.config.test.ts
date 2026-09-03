import { CONSTANTS } from '../utils/env'
import { cassandraClientOptions } from './cassandra.config'

describe('cassandraClientOptions', () => {
  it('splits the configured CASSANDRA_IP into contact points', () => {
    expect(cassandraClientOptions.contactPoints).toEqual(CONSTANTS.CASSANDRA_IP.split(','))
  })

  it('uses the configured keyspace', () => {
    expect(cassandraClientOptions.keyspace).toBe(CONSTANTS.CASSANDRA_KEYSPACE)
  })

  it('targets datacenter1 with prepared queries', () => {
    expect(cassandraClientOptions.localDataCenter).toBe('datacenter1')
    expect(cassandraClientOptions.queryOptions).toEqual({ prepare: true })
  })
})
