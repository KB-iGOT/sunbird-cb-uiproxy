import compression from 'compression'
import connectTimeout from 'connect-timeout'
import cors from 'cors'
import express, { NextFunction } from 'express'
import fileUpload from 'express-fileupload'
import expressSession from 'express-session'
import helmet from 'helmet'
import morgan from 'morgan'
import { authContent } from './authoring/authContent'
import { authIapBackend } from './authoring/authIapBackend'
import { authNotification } from './authoring/authNotification'
import { authSearch } from './authoring/authSearch'
import { authApi } from './authoring/content'
import { getSessionConfig } from './configs/session.config'
import { protectedApiV8 } from './protectedApi_v8/protectedApiV8'
import { proxiesV8 } from './proxies_v8/proxies_v8'
import { publicApiV8 } from './publicApi_v8/publicApiV8'
import { CustomKeycloak } from './utils/custom-keycloak'
import { CONSTANTS } from './utils/env'
import { logDebug, logError, logSuccess } from './utils/logger'
import {
  getLogLevelHandler,
  resetLogLevelHandler,
  setLogLevelHandler,
  startLogLevelSync,
} from './utils/logLevelControl'
const { frameworkAPI } = require('@project-sunbird/ext-framework-server/api')
const frameworkConfig = require('./configs/framework.config')
const cookieParser = require('cookie-parser')
const healthcheck = require('express-healthcheck')

import { apiWhiteListLogger, isAllowed } from './utils/apiWhiteList'

function haltOnTimedOut(req: Express.Request, _: Express.Response, next: NextFunction) {
  if (!req.timedout) {
    next()
  }
}
export class Server {
  static bootstrap() {
    const server = new Server()
    server.app.listen(CONSTANTS.PORTAL_PORT, '0.0.0.0', () => {
      logSuccess(`${process.pid} : Server started at ${CONSTANTS.PORTAL_PORT}`)
    })
  }

  protected app = express()
  private keycloak?: CustomKeycloak
  private constructor() {
    if (CONSTANTS.CORS_ENVIRONMENT === 'dev') {
      this.app.use(cors({origin: 'https://local.igot-dev.in:3000', credentials: true}))
    } else {
      this.app.use(cors())
    }
    const sessionConfig = getSessionConfig()
    this.app.use(expressSession(sessionConfig))
    this.app.use(express.urlencoded({ extended: false, limit: '50mb' }))
    // Strip /apis prefix added by nginx in production (not present locally)
    this.app.use((req, _res, next) => {
      if (req.url.startsWith('/apis/')) {
        req.url = req.url.slice('/apis'.length)
      }
      next()
    })
    // Strip incorrect content-length from mobile clients before body-parser reads the stream.
    // Mobile clients (Dart/Flutter) sometimes send a content-length matching the minified JSON
    // while actually sending a formatted (longer) body, causing raw-body to truncate the read.
    this.app.use((req, _res, next) => {
      if (req.method === 'POST' && req.headers['content-length']) {
        delete req.headers['content-length']
      }
      next()
    })
    this.app.use(express.json({ limit: '50mb' }))
    this.setCookie()
    this.app.all('*', apiWhiteListLogger())
    if (CONSTANTS.PORTAL_API_WHITELIST_CHECK === 'true') {
      this.app.all('*', isAllowed())
    }
    this.setKeyCloak(sessionConfig)
    this.configureLogLevelControl()
    this.authoringProxies()
    this.setExtFormsFramework()
    this.servePublicApi()
    this.configureMiddleware()
    this.serverProtectedApi()
    this.serverProxies()
    this.authoringApi()
    this.resetCookies()
    this.app.use(haltOnTimedOut)
    this.registerGlobalErrorHandler()
  }

  // Must be registered after all routes — Express identifies error handlers by arity (4 params)
  // tslint:disable-next-line: no-any
  private registerGlobalErrorHandler() {
    // Handle malformed JSON request bodies (e.g. wrong content-length from mobile clients)
    // tslint:disable-next-line: no-any
    this.app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err && err.status === 400 && err.type === 'entity.parse.failed') {
        logError('Bad request - malformed JSON body:', String(err.message))
        if (!res.headersSent) {
          res.status(400).json({ error: 'Malformed JSON in request body' })
        }
        return
      }
      next(err)
    })
    // tslint:disable-next-line: no-any
    this.app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      logError('Unhandled server error:', String(err && err.message ? err.message : err))
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal Server Error' })
      }
    })
  }

  private configureLogLevelControl() {
    startLogLevelSync()
    if (this.keycloak) {
      this.app.get('/protected/v8/internal/log-level', this.keycloak.protect, getLogLevelHandler)
      this.app.post('/protected/v8/internal/log-level', this.keycloak.protect, (req, res) => {
        void setLogLevelHandler(req, res)
      })
      this.app.post('/protected/v8/internal/log-level/reset', this.keycloak.protect, (req, res) => {
        void resetLogLevelHandler(req, res)
      })
    }
  }

  private setCookie() {
    this.app.use(cookieParser())
    this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const rootOrg = req.headers ? req.headers.rootOrg || req.headers.rootorg : ''
      if (rootOrg && req.hostname && req.hostname.toLowerCase().includes('localhost')) {
        res.cookie('rootorg', rootOrg)
      }
      next()
    })
    this.app.use((_req: express.Request, _res: express.Response, next: express.NextFunction) => {
      // tslint:disable
      // res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate')
      //  res.header('Cache-Control', 'max-age=14400, must-revalidate')
      // res.header('Expires', '-1')
      // res.header('Pragma', 'no-cache')
      // tslint:enable
      next()
    })
  }

  private configureMiddleware() {
    this.app.use(connectTimeout('240s'))
    this.app.use(compression())
    this.app.use(fileUpload())
    // this.app.use(cors())
    this.app.use('/healthcheck', healthcheck({
      healthy() {
        return { everything: 'is ok' }
      },
    }))
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            frameAncestors: [`'self'`],
          },
        },
        dnsPrefetchControl: { allow: true },
        frameguard: { action: 'sameorigin' },
        hidePoweredBy: true,
        ieNoOpen: true,
        noCache: false,
        noSniff: true,
      })
    )
    // TODO: See what needs to be logged
    this.app.use((req, _, next) => {
      logDebug('adding x-forward-proto header with https to request...')
      req.headers['x-forwarded-proto'] = 'https'
      logDebug(`Server:ConfigureMiddleWare:: Worker ${process.pid} : ${req.protocol}://${req.hostname}/${req.url}`)
      next()
    })

    // Using single configured morgan logger
    this.app.use(morgan('short'))

    this.app.use(haltOnTimedOut)
  }
  // tslint:disable-next-line: no-any
  private setKeyCloak(sessionConfig: any) {
    this.keycloak = new CustomKeycloak(sessionConfig)
    this.app.use(this.keycloak.middleware)
  }

  private setExtFormsFramework() {
    this.app.post('/static/form/v1/read', (req, _, next) => {
      logDebug('Request hit /static/form/v1/read, forwarding to /v1/form/read')
      req.url = '/v1/form/read'
      next()
    })
    logDebug('setExtFormsFramework MEthod - frameworkConfig :: ', JSON.stringify(frameworkConfig))
    // tslint:disable-next-line: no-any
    frameworkAPI.bootstrap(frameworkConfig, this.app).then((data: any) => {
      logDebug('Successfuly bootstrapped frameworkAPI', data)
    })
    // tslint:disable-next-line: no-any
    .catch((error: any ) => logError('Error in frameworkAPI bootstrap', error))
  }
  private servePublicApi() {
    this.app.use('/public/v8', publicApiV8)
  }

  private serverProtectedApi() {
    if (this.keycloak) {
      this.app.use('/protected/v8', this.keycloak.protect, protectedApiV8)
    }
  }
  private serverProxies() {
    if (this.keycloak) {
      this.app.use('/proxies/v8', this.keycloak.protect, proxiesV8)
    }
  }
  private authoringProxies() {
    if (this.keycloak) {
      this.app.use('/authContent', this.keycloak.protect, authContent)
      this.app.use('/authNotificationApi', this.keycloak.protect, authNotification)
      this.app.use('/authIapApi', this.keycloak.protect, authIapBackend)
    }
  }
  private authoringApi() {
    if (this.keycloak) {
      this.app.use('/authSearchApi', this.keycloak.protect, authSearch)
      this.app.use('/authApi', authApi)
    }
  }
  private resetCookies() {
    this.app.use('/reset', (_req, res) => {
      logDebug('CLEARING RES COOKIES')
      const host = _req.get('host')
      logDebug('host is: ' + host)
      logDebug('response cookies: ' + JSON.stringify(_req.session))
      logDebug('Cookies:' + _req.get('cookies'))
      logDebug('Cookie:' + _req.get('cookie'))
      logDebug('Cookies::::' + JSON.stringify(_req.cookies))
      let domainUrl = ''
      if (host !== undefined) {
        if (host.includes('localhost')) {
          domainUrl = 'localhost' // For localhost, set domainUrl to localhost
        } else {
          const hostParts = host.split('.')
          if (hostParts.length > 2) {
            domainUrl = '.' + hostParts.slice(1).join('.')
          } else {
            domainUrl = host
          }
        }
      }
      res.clearCookie('connect.sid', {httpOnly: true, secure: true, })
      res.clearCookie('connect.sid', { domain: domainUrl, httpOnly: false, path: '/', secure: true, })
      logDebug('After delete Cookies::::' + JSON.stringify(_req.cookies))
      if (_req.session) {
        _req.session.destroy(() => {
          logDebug('Session Destroyed')
          res.redirect('/apis/logout')
        })
      } else {
        logDebug('No Session to destroy.')
        res.redirect('/apis/logout')
      }
    })
  }

  // private handleShutDowns() {
  //   await frameworkAPI.closeCassandraConnections();
  // }
}
