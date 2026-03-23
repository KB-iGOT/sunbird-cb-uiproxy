import cassandraDriver from 'cassandra-driver'
import { CONSTANTS } from '../utils/env'

export const cassandraClientOptions: cassandraDriver.ClientOptions = {
    contactPoints: getIPList(),
    keyspace: CONSTANTS.CASSANDRA_KEYSPACE,
    localDataCenter: 'datacenter1',
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
    },
}

function getIPList() {
    return CONSTANTS.CASSANDRA_IP.split(',')
}
