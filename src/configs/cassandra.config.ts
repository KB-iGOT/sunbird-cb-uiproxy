import cassandraDriver from 'cassandra-driver'
import { CONSTANTS } from '../utils/env'

export const cassandraClientOptions: cassandraDriver.ClientOptions = {
    contactPoints: getIPList(),
    keyspace: CONSTANTS.CASSANDRA_KEYSPACE,
    localDataCenter: CONSTANTS.CASSANDRA_LOCAL_DATACENTER,
    queryOptions: {
        prepare: true,
    },
}

function getIPList() {
    return CONSTANTS.CASSANDRA_IP.split(',')
}
