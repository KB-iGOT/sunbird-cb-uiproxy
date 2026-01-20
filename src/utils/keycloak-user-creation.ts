// import KcAdminClient from '@keycloak/keycloak-admin-client'
import cassandraDriver from 'cassandra-driver'
import request from 'request'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'

const CASSANDRA_KEYSPACE = CONSTANTS.CASSANDRA_KEYSPACE
const defaultNewUserPassword = CONSTANTS.KC_NEW_USER_DEFAULT_PWD

const cassandraClientOptions: cassandraDriver.ClientOptions = {
    contactPoints: getIPList(),
    keyspace: CASSANDRA_KEYSPACE,
    localDataCenter: 'datacenter1',
    queryOptions: {
        prepare: true,
    },
}

function getIPList() {
    return CONSTANTS.CASSANDRA_IP.split(',')
}

const keycloakConfig = {
    baseUrl: CONSTANTS.PORTAL_AUTH_SERVER_URL,
    realmName: CONSTANTS.KEYCLOAK_REALM,
}

let kcAdminClient: any

const getKcAdminClient = async () => {
    if (kcAdminClient) { return kcAdminClient }
    const { default: KcAdminClient } = await import('@keycloak/keycloak-admin-client')
    kcAdminClient = new KcAdminClient(keycloakConfig)
    return kcAdminClient
}

// tslint:disable-next-line: no-any
export function checkUniqueKey(uniqueKey: any, callback: (arg0: Error, arg1: any) => void) {
    const clientConnect = new cassandraDriver.Client(cassandraClientOptions)
    clientConnect.execute(`SELECT * FROM ${CASSANDRA_KEYSPACE}.eagle_unique_identifiers
     WHERE key=${uniqueKey}`, (err, result) => {
        if (!err && result && result.rows.length > 0) {
            const key = result.rows[0]
            callback(err, key)
        } else {
            callback(new Error('checkUniqueKey: No records'), null)
        }
        // Run next function in series
        clientConnect.shutdown()
    })
}

// tslint:disable-next-line: no-any
export function checkUUIDMaster(uniqueKey: any): Promise<any> {
    try {
        const clientConnect = new cassandraDriver.Client(cassandraClientOptions)
        return new Promise((resolve, reject) => {
            clientConnect.execute(`SELECT * FROM ${CASSANDRA_KEYSPACE}.eagle_uuid_master
            WHERE key=${uniqueKey} allow filtering`, (error, result) => {
                if (!error && result && result.rows.length > 0) {
                    const key = result.rows[0]
                    resolve(key)
                } else {
                    logInfo('Error on DB request : ')
                    reject(false)
                }
                clientConnect.shutdown()
            })
        })
    } catch (err) {
        logError('DB Request to open user profile status failed')
        throw err
    }
}

// tslint:disable-next-line: no-any
export function updateUniqueKey(uniqueKey: any, callback: (arg0: Error, arg1: any) => void) {
    const clientConnect = new cassandraDriver.Client(cassandraClientOptions)
    clientConnect.execute(`UPDATE ${CASSANDRA_KEYSPACE}.eagle_unique_identifiers
    SET active = false WHERE key = ${uniqueKey}`,
        (err, result) => {
            if (result) {
                callback(err, result)
            } else {
                callback(new Error('updateUniqueKey: No records'), null)
            }
            clientConnect.shutdown()
        })
}

// tslint:disable-next-line: no-any
export function updateUUIDMaster(uniqueKey: any, email: string): Promise<any> {
    try {
        const clientConnect = new cassandraDriver.Client(cassandraClientOptions)
        return new Promise((resolve, reject) => {
            clientConnect.execute(`UPDATE ${CASSANDRA_KEYSPACE}.eagle_uuid_master
            SET active = false WHERE key = ${uniqueKey} and email = '${email}'`,
                (_err, result) => {
                    if (result) {
                        resolve(result)
                    } else {
                        reject(new Error('updateUUIDMaster: No records'))
                    }
                    clientConnect.shutdown()
                })
        })
    } catch (err) {
        logError('DB Request to open user profile status failed')
        throw err
    }
}

// tslint:disable-next-line: no-any
export async function createKeycloakUser(req: any) {
    try {
        const client = await getKcAdminClient()
        await client.auth({
            clientId: 'admin-cli',
            grantType: 'password',
            password: CONSTANTS.KEYCLOAK_ADMIN_PASSWORD,
            username: CONSTANTS.KEYCLOAK_ADMIN_USERNAME,
        })
        client.setConfig({
            realmName: CONSTANTS.KEYCLOAK_REALM,
        })

        const createReq = {
            email: req.body.email,
            emailVerified: true,
            enabled: true,
            firstName: req.body.fname || '',
            lastName: req.body.lname || '',
            username: req.body.email,
        }

        return client.users.create(createReq)
            // tslint:disable-next-line: no-any
            .then((resp: any) => {
                return resp
            })
            // tslint:disable-next-line: no-any
            .catch((err: any) => {
                throw err
            })

    } catch (err) {
        logError('ERROR IN METHOD createKeycloakUser >', err)
        throw err
    }

}

// tslint:disable-next-line: no-any
export async function getAuthToken(email: any): Promise<any> {
    logInfo('Starting to get new user token from keycloak...')
    // tslint:disable-next-line: no-try-promise
    try {
        const request1 = {
            client_id: 'portal',
            grant_type: 'password',
            scope: 'openid',
            username: email,
            // tslint:disable-next-line: object-literal-sort-keys
            password: defaultNewUserPassword,
        }

        return new Promise((resolve, reject) => {
            request.post({
                url: `${CONSTANTS.PORTAL_AUTH_SERVER_URL}/realms/${CONSTANTS.KEYCLOAK_REALM}/protocol/openid-connect/token`,
                // tslint:disable-next-line: object-literal-sort-keys
                form: request1,
            }, (err, _httpResponse, body) => {
                if (err) {
                    logError('err in getAuthToken api ', err)
                    reject(err)
                }
                if (body) {
                    resolve(JSON.parse(body))
                }
            })
        })

    } catch (err) {
        logError('ERROR ON Keycloak openid-connect/token >', err)
        return err
    }
}

export async function UpdateKeycloakUserPassword(keycloakId: string, isTemporary: boolean) {
    // tslint:disable-next-line: no-commented-code
    // const request1 = {
    //     type: 'password',
    //     value: 'user@123',
    //     temporary: false,
    // }
    // return await axios.put(
    //     `${CONSTANTS.HTTPS_HOST}/auth/admin/realms/${CONSTANTS.KEYCLOAK_REALM}/users/${keycloakId}/reset-password`,
    //     request1,
    //     {
    //         ...axiosRequestConfig,
    //         headers: {
    //             Authorization: req.header('authorization'),
    //         },
    //     }
    // )
    const req = {
        credential: {
            temporary: isTemporary,
            type: 'password',
            value: defaultNewUserPassword,
        },
        id: keycloakId,
    }
    return (await getKcAdminClient()).users.resetPassword(req)
        // tslint:disable-next-line: no-any
        .then((resp: any) => {
            return resp
            // tslint:disable-next-line: no-any
        }).catch((err: any) => {
            throw err
        })
}

export async function sendActionsEmail(userId: string) {
    // try {
    const client = await getKcAdminClient()
    await client.auth({
        clientId: 'portal',
        grantType: 'password',
        password: CONSTANTS.KEYCLOAK_ADMIN_PASSWORD,
        username: CONSTANTS.KEYCLOAK_ADMIN_USERNAME,
    })
    client.setConfig({
        realmName: CONSTANTS.KEYCLOAK_REALM,
    })
    logInfo(`Sending email to ${userId}`)
    logInfo(`redirect Uri: `, CONSTANTS.HTTPS_HOST)
    return client.users.executeActionsEmail({
        actions: ['VERIFY_EMAIL'],
        clientId: 'portal',
        id: userId,
        lifespan: 2592000,
        redirectUri: CONSTANTS.HTTPS_HOST,
    })
        // tslint:disable-next-line: no-any
        .then((resp: any) => {
            return resp
            // tslint:disable-next-line: no-any
        }).catch((err: any) => {
            throw err
        })
}
