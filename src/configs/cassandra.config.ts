import cassandraDriver from 'cassandra-driver'
import { CONSTANTS } from '../utils/env'

export const cassandraClientOptions: cassandraDriver.ClientOptions = {
    contactPoints: getIPList(),
    keyspace: CONSTANTS.CASSANDRA_KEYSPACE,
    localDataCenter: CONSTANTS.CASSANDRA_LOCAL_DC || 'datacenter1',
    protocolOptions: {
        maxVersion: 4,
    },
    queryOptions: {
        prepare: true,
    },
    socketOptions: {
        connectTimeout: 10000,
        readTimeout: 12000,
    },
    policies: {
        retry: new cassandraDriver.policies.retry.IdempotenceAwareRetryPolicy(
            new cassandraDriver.policies.retry.RetryPolicy()
        ),
    },
    pooling: {
        coreConnectionsPerHost: {
            [cassandraDriver.types.distance.local]: 2,
            [cassandraDriver.types.distance.remote]: 1,
        },
        maxConnectionsPerHost: {
            [cassandraDriver.types.distance.local]: 8,
            [cassandraDriver.types.distance.remote]: 2,
        },
    },
}

function getIPList() {
    return CONSTANTS.CASSANDRA_IP.split(',')
}
