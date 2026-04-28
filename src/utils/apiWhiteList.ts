const _                 = require('lodash')
const uuidv1            = require('uuid/v1')
const { pathToRegexp }  = require('path-to-regexp')
const dateFormat        = require('dateformat')

import { NextFunction, Request, Response } from 'express'
import { CONSTANTS } from './env'
import { logDebug, logError } from './logger'
import { ROLE } from './roles'
import { API_LIST } from './whitelistApis'

// Pre-compile all 925 URL patterns at startup (once) instead of per-request.
// Saves 2 × 925 = 1850 regex compilations per request.
const compiledPatterns: Array<{ pattern: string, regex: RegExp }> = []

function initCompiledPatterns() {
    if (compiledPatterns.length > 0) {
        return
    }
    if (API_LIST.URL_PATTERN && API_LIST.URL_PATTERN.length > 0) {
        // tslint:disable-next-line: no-any
        API_LIST.URL_PATTERN.forEach((url: any) => {
            try {
                compiledPatterns.push({ pattern: url, regex: pathToRegexp(url) })
            } catch (err) {
                logError('Failed to compile URL pattern:', url)
            }
        })
        logDebug(`Compiled ${compiledPatterns.length} URL patterns for whitelist matching`)
    }
}

// Compile eagerly — API_LIST is available since it's imported above
initCompiledPatterns()

/**
 * Match a request path against pre-compiled URL patterns.
 * Returns the matched pattern string, or null if no match.
 */
function matchUrlPattern(reqPath: string): string | null {
    // Lazy fallback in case eager init ran before API_LIST was ready
    if (compiledPatterns.length === 0) {
        initCompiledPatterns()
    }
    for (const entry of compiledPatterns) {
        if (entry.regex.test(reqPath)) {
            return entry.pattern
        }
    }
    return null
}

/**
 * @param  { String } REQ_URL - Request URL
 * @returns { Boolean } - Return boolean value based on exclude path criteria
 */
// tslint:disable-next-line: no-any
const checkIsStaticRoute = (REQ_URL: any) => {
    const excludePath = [
        '.md',
        '.js',
        '.js.map',
        '.ico',
        '.ttf',
        '.woff2',
        '.woff',
        '.eot',
        '.svg',
        '.gif',
        '.png',
        '.html',
        '/dist/',
        '/streaming/',
        '/resourcebundles/',
        '/assets/',
        '/content-plugins/',
        '/editors/',
        '/public/',
        '/logout',
        '/v1/form/read',
        '/static/form/v1/read',
    ]
    // tslint:disable-next-line: no-any
    return _.some(excludePath, (path: any) => _.includes(REQ_URL, path))
}

const shouldAllow = (req: Request) => {
    // Ignore static routes
    return req.path === '/' || checkIsStaticRoute(req.path)
}

/**
 * @description
 * Set of methods which checks for certain condition on URL
 * @since release-3.1.0
 */
const urlChecks = {
    // tslint:disable-next-line: no-any
    PARAM_EQUALITY_CHECK: async (resolve: any, reject: any, req: Request, checksParams: any, REQ_URL: any) => {
        if (_.get(checksParams, 'checks')) {
            // tslint:disable-next-line: no-any
            const ownerChecks: any[] = []
            // tslint:disable-next-line: no-any
            checksParams.checks.forEach((ownerCheckObj: any) => {
                ownerChecks.push(new Promise((res, rej) => {
                const _checkFor = _.get(ownerCheckObj, 'entity')
                if (_checkFor && typeof urlChecks[_checkFor] === 'function') {
                    urlChecks[_checkFor](res, rej, req, ownerCheckObj, REQ_URL)
                }
                }))
            })
            try {
                await Promise.all(ownerChecks)
                .then((_pSuccess) => {
                    resolve()
                })
                .catch((pError) => {
                    return reject(pError)
                })
            } catch (error) {
                return reject()
            }
        } else {
          return reject('Owner check validation failed.')
        }
    },
    // tslint:disable-next-line: no-any
    ROLE_CHECK: (resolve: any, reject: any, req: Request, rolesForURL: any, REQ_URL: any) => {
        const roleData = _.get(req, 'session.userRoles')
        const data = (roleData) ? roleData : []
        logDebug('Portal_API_WHITELIST : Middleware for URL [ ' + REQ_URL + ' ]')
        logDebug('Configured Roles for URL -> ' + JSON.stringify(rolesForURL))
        if (_.includes(rolesForURL, 'ALL') && data.length > 0) {
            logDebug('RolesForAll is getting called')
            resolve()
        } else if (_.intersection(rolesForURL, data).length > 0) {
            logDebug('RolesForUrl is getting called')
            resolve()
        } else {
            return reject('User doesn\'t have appropriate roles')
        }
    },
    // tslint:disable-next-line: no-any
    SCOPE_CHECK : (resolve: any, reject: any, req: Request, rolesForURL: any, REQ_URL: any) => {
        logDebug('Portal_API_WHITELIST_SCOPE_CHECK : Middleware for URL [ ' + REQ_URL + ' ]')
        const orgData = (_.get(req, 'session.orgs')) ? _.get(req, 'session.orgs') : []
        const orgId = (_.get(req, 'query.orgId')) ? _.get(req, 'query.orgId') : ''
        if (_.isEmpty(orgId) || _.isEmpty(orgData)) {
            return reject('User doesn\'t have appropriate organisation for scope check 1')
        }
        // tslint:disable-next-line: no-any
        let scopeRoles: any = []
        // tslint:disable-next-line: no-any
        orgData.forEach((element: any) => {
            if (orgId === element.organisationId) {
                scopeRoles = element.roles
            }
        })

        if (_.isEmpty(scopeRoles)) {
            return reject('User doesn\'t have appropriate organisation for scope check')
        }

        if (_.includes(rolesForURL, 'ALL') && scopeRoles.length > 0) {
            resolve()
        } else if (_.intersection(rolesForURL, scopeRoles).length > 0) {
            resolve()
        } else {
            return reject('User doesn\'t have appropriate roles')
        }
    },
    // Callback to `PARAM_EQUALITY_CHECK` promise object
    // tslint:disable-next-line: no-any
    __adminCheck__userId: (resolve: any, reject: any, req: any, ownerCheckObj: any, _REQ_URL: any) => {
        try {
            const _sessionUserId = _.get(req, 'session.userId')
            const _reqUserId = _.get(ownerCheckObj, 'params') ? _.get(req, ownerCheckObj.params) : _.get(req, 'body.userId')
            const _sessionRole = _.get(req, 'session.userRoles')
            if (_.includes(_sessionRole, ROLE.MDO_ADMIN)) {
                resolve()
            } else {
                if (_sessionUserId === _reqUserId) {
                    resolve()
                } else {
                    return reject('Mismatch in user id verification. Session UserId [ ' + _sessionUserId +
                    ' ] is not an admin or does not match with request body UserId [ ' + _reqUserId + ' ]')
                }
            }
        } catch (error) {
            return reject('User id validation failed.')
        }
    },
    // Callback to `PARAM_EQUALITY_CHECK` promise object
    // tslint:disable-next-line: no-any
    __param__equality: (resolve: any, reject: any, req: any, ownerCheckObj: any, _REQ_URL: any) => {
        try {
            const comparedWith = _.get(ownerCheckObj, 'session') ? _.get(req, ownerCheckObj.session) : null
            const comparedFrom = _.get(ownerCheckObj, 'requestbody') ? _.get(req, ownerCheckObj.requestbody) : null

            if ((_.isArray(comparedWith) && _.isArray(comparedFrom)) && (_.intersection(comparedWith, comparedFrom).length > 0)) {
                resolve()
            } else if (_.isArray(comparedWith) && (_.includes(comparedWith, comparedFrom))) {
                resolve()
            } else if (_.isArray(comparedFrom) && (_.includes(comparedFrom, comparedWith))) {
                resolve()
            } else if (comparedWith === comparedFrom) {
                resolve()
            } else {
                return reject('Mismatch in param validation')
            }
        } catch (error) {
            return reject('User id validation failed.')
        }
    },
}

/**
 * @param  {Object} req             - Request Object
 * @param  {Object} res             - Response Object
 * @param  {Function} next          - Function for next middleware
 * @param  {Array} checksToExecute  - Array of methods (checks; defined in urlChecks object)
 * @description
 * 1. Array of methods executed by promise
 * 2. On success; API is allowed
 * 3. On error; 403 Forbidden response is sent
 * @since release-3.1.0
 */
// tslint:disable-next-line: no-any
const executeChecks = async (req: Request, res: Response , next: NextFunction, checksToExecute: any = []) => {
    try {
        // tslint:disable-next-line: no-any
        await (Promise as any).allSettled(checksToExecute)
        // tslint:disable-next-line: no-any
        .then((pSuccess: any) => {
            if (pSuccess) {
                const _isRejected = _.find(pSuccess, {status: 'rejected'})
                if (_isRejected) {
                    throw new Error(_isRejected.reason)
                } else {
                    next()
                }
            } else {
                throw new Error('API whitelisting validation failed')
            }
        })
        // tslint:disable-next-line: no-any
        .catch((pError: any) => {
            logError(pError)
            respond403(req, res)
        })
    } catch (error) {
        // tslint:disable-next-line: no-console
        console.log('ERROR --', error)
        respond403(req, res)
    }
}

/**
 * @param  {Object} req             - Request Object
 * @param  {Object} res             - Response Object
 * @description - Generic function to return 403 Forbidden response
 * @since release-3.1.0
 */
const respond403 = (req: Request, res: Response) => {
    const REQ_URL = req.path
    const err = ({ msg: 'API WHITELIST :: Forbidden access for API [ ' + REQ_URL + ' ]', url: REQ_URL })
    logError(err.msg)
    res.status(403)
    res.send(
    {
        id: 'api.error',
        ver: '1.0',
        // tslint:disable-next-line: object-literal-sort-keys
        ts: dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss:lo'),
        params:
        {
            resmsgid: uuidv1(),
            // tslint:disable-next-line: object-literal-sort-keys
            msgid: null,
            status: 'failed',
            err: 'FORBIDDEN_ERROR',
            errmsg: 'Forbidden: API WHITELIST Access is denied',
        },
        responseCode: 'FORBIDDEN',
        result: {},
    })
    res.end()
}

const respond419 = (req: Request, res: Response) => {
    const REQ_URL = req.path
    if (_.includes(REQ_URL, '/reset')) {
        res.redirect('/apis/logout')
    } else {
        const err = ({ msg: 'API WHITELIST :: Unauthorized access for API [ ' + REQ_URL + ' ]', url: REQ_URL })
        logError(err.msg)
        res.status(419)
        res.setHeader('location', redirectToLogin(req))
        res.send(
        {
            id: 'api.error',
            ver: '1.0',
            // tslint:disable-next-line: object-literal-sort-keys
            ts: dateFormat(new Date(), 'yyyy-mm-dd HH:MM:ss:lo'),
            params:
            {
                resmsgid: uuidv1(),
                // tslint:disable-next-line: object-literal-sort-keys
                msgid: null,
                status: 'failed',
                err: 'UNAUTHORIZED_ERROR',
                errmsg: 'UNAUTHORIZED: Access is denied',
            },
            responseCode: 'UNAUTHORIZED',
            redirectUrl: redirectToLogin(req),
            result: {},
        })
    }

    res.end()
}

/**
 * @description - Function to check whether
 * 1. Incoming API is whitelisted (or) not
 * 2. If API does not exists then request is terminated and 403 Forbidden response is sent
 * 3. If incoming API is present in API_LIST (whitelistApis); then check URL pattern matching
 * 4. Refer `API_LIST` and execute the checks defined
 * @since release-3.1.0
 */
export const isAllowed = () => {
    // tslint:disable-next-line: only-arrow-functions
    return function(req: Request, res: Response, next: NextFunction) {
        let REQ_URL = req.path
        if (CONSTANTS.PORTAL_API_WHITELIST_CHECK === 'true') {
            // tslint:disable-next-line: max-line-length
            if (shouldAllow(req) || _.includes(REQ_URL, '/resource') || _.includes(REQ_URL, '/eclogin') || _.includes(REQ_URL, '/aiassessmentlogin')) {
                logDebug('Path : ' + REQ_URL + ' is in excluded list.')
                next()
            } else {

                // Pattern match for URL (uses pre-compiled regexes)
                const matchedPattern = matchUrlPattern(REQ_URL)
                if (matchedPattern) {
                    REQ_URL = matchedPattern
                }
                // Is API whitelisted ?
                if (_.get(API_LIST.URL, REQ_URL)) {
                    const URL_RULE_OBJ = _.get(API_LIST.URL, REQ_URL)
                    // tslint:disable-next-line: no-any
                    const checksToExecute: any[] = []

                    // Iterate for checks defined for API and push to array
                    if (_.isEmpty(URL_RULE_OBJ.checksNeeded)) {
                        next()
                    } else {
                        const urlChecksNeeded = URL_RULE_OBJ.checksNeeded
                        // tslint:disable-next-line: no-any
                        urlChecksNeeded.forEach((CHECK: any) => {
                            // tslint:disable-next-line: no-shadowed-variable
                            checksToExecute.push(new Promise((res, rej) => {
                            if (_.get(URL_RULE_OBJ, CHECK) && typeof urlChecks[CHECK] === 'function') {
                                urlChecks[CHECK](res, rej, req, URL_RULE_OBJ[CHECK], REQ_URL)
                            }
                            }))
                        })
                        executeChecks(req, res, next, checksToExecute)
                    }
                } else {
                    // If API is not whitelisted
                    logDebug('Portal_API_WHITELIST: URL not whitelisted')
                    respond403(req, res)
                }
            }
        } else {
            next()
        }
    }
}
const redirectToLogin = (req: Request) => {
    const REQ_URL = req.path
    logError('req.path--', REQ_URL)
    const redirectUrl = 'protected/v8/resource/'
    return `https://${req.get('host')}/${redirectUrl}` // 'http://localhost:3003/protected/v8/user/resource/'
    // tslint:disable-next-line: no-commented-code
    // return 'http://localhost:3003/protected/v8/user/resource/'
}

const validateAPI = (req: Request, res: Response, next: NextFunction) => {
    let REQ_URL_ORIGINAL = req.path
    // Pattern match for URL (uses pre-compiled regexes)
    const matched = matchUrlPattern(REQ_URL_ORIGINAL)
    if (matched) {
        REQ_URL_ORIGINAL = matched
    }
    if (_.get(API_LIST.URL, REQ_URL_ORIGINAL)) {
        next()
    } else {
        // If API is not whitelisted
        logDebug('Portal_API_WHITELIST_LOGGER: URL not whitelisted')
        respond403(req, res)
    }
}
/**
 * This function is used for checking whether
 */
export function apiWhiteListLogger() {
    return (req: Request, res: Response, next: NextFunction) => {
        if (req.path === '/' || checkIsStaticRoute(req.path)) {
            next()
            return
        }
        const REQ_URL = req.path
        logError('req.path--', req)
        logError('req.path--', REQ_URL)
        // tslint:disable-next-line: max-line-length
        if (!_.includes(REQ_URL, '/resource') && !_.includes(REQ_URL, '/eclogin') && !_.includes(REQ_URL, '/aiassessmentlogin') && (req.session)) {
             logDebug('UIPROXY:: apiWhiteListLogger : checking if the login is to resource  and session is there')
             if (!('userRoles' in req.session) || (('userRoles' in req.session) && (req.session.userRoles.length === 0))) {
                logError('Portal_API_WHITELIST_LOGGER: User needs to authenticated themselves', '------', new Date().toString())
                logDebug('UIPROXY:: apiWhiteListLogger :  respond419 method will be called')
                respond419(req, res)
            } else {
                // Pattern match for URL
                logDebug('In WhilteList Call========' + REQ_URL, '------', new Date().toString())
                validateAPI(req, res, next)
            }
        } else {
            next()
        }
    }
}
