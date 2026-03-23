import cassandraDriver from 'cassandra-driver'
import { cassandraClientOptions } from '../configs/cassandra.config'
import { logDebug, logError } from './logger'

/**
 * Singleton Cassandra client shared across all request handlers.
 * Avoids creating a new client (with full TCP handshake, topology discovery,
 * and prepared-statement registration) on every request.
 */
let sharedClient: cassandraDriver.Client | null = null

export function getCassandraClient(): cassandraDriver.Client {
    if (!sharedClient) {
        sharedClient = new cassandraDriver.Client(cassandraClientOptions)
        sharedClient.on('log', (level: string, _className: string, message: string) => {
            if (level === 'error') {
                logError('Cassandra client error:', message)
            }
        })
        logDebug('Singleton Cassandra client created')
    }
    return sharedClient
}

/**
 * Check if the Cassandra client can reach the cluster.
 * Returns true if healthy, false otherwise.
 */
export async function isCassandraHealthy(): Promise<boolean> {
    try {
        const client = getCassandraClient()
        await client.execute('SELECT now() FROM system.local')
        return true
    } catch {
        return false
    }
}

/**
 * Gracefully close the shared Cassandra client.
 * Call this during process shutdown.
 */
export async function shutdownCassandraClient(): Promise<void> {
    if (sharedClient) {
        logDebug('Shutting down singleton Cassandra client...')
        await sharedClient.shutdown()
        sharedClient = null
    }
}
