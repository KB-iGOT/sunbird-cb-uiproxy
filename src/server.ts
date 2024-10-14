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
import { logError, logInfo, logSuccess } from './utils/logger'
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
    this.app.use(express.json({ limit: '50mb' }))
    this.setCookie()
    this.app.all('*', apiWhiteListLogger())
    if (CONSTANTS.PORTAL_API_WHITELIST_CHECK === 'true') {
      this.app.all('*', isAllowed())
    }
    this.setKeyCloak(sessionConfig)
    this.authoringProxies()
    this.setExtFormsFramework()
    this.servePublicApi()
    this.configureMiddleware()
    this.serverProtectedApi()
    this.serverProxies()
    this.authoringApi()
    this.resetCookies()
    this.app.use(haltOnTimedOut)
  }

  private setCookie() {
    this.app.use(cookieParser())
    this.app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
      const rootOrg = req.headers ? req.headers.rootOrg || req.headers.rootorg : ''
      if (rootOrg && req.hostname.toLowerCase().includes('localhost')) {
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
      logInfo('adding x-forward-proto header with https to request...')
      req.headers['x-forwarded-proto'] = 'https'
      logInfo(`Server:ConfigureMiddleWare:: Worker ${process.pid} : ${req.protocol}://${req.hostname}/${req.url}`)
      next()
    })
    this.app.use(morgan('dev'))
    this.app.use(
      morgan((tokens: morgan.TokenIndexer, req, res) =>
        [
          process.pid,
          tokens.method(req, res),
          tokens.url(req, res),
          tokens.status(req, res),
          tokens.res(req, res, 'content-length'),
          '-',
          tokens['response-time'](req, res),
          'ms',
          `timeout: ${CONSTANTS.TIMEOUT}`,
        ].join(' ')
      )
    )
    this.app.use(haltOnTimedOut)
  }
  // tslint:disable-next-line: no-any
  private setKeyCloak(sessionConfig: any) {
    this.keycloak = new CustomKeycloak(sessionConfig)
    this.app.use(this.keycloak.middleware)
  }

  private setExtFormsFramework() {
    this.app.post('/static/form/v1/read', (req, _, next) => {
      logInfo('Request hit /static/form/v1/read, forwarding to /v1/form/read')
      req.url = '/v1/form/read'
      next()
    })

    logInfo('setExtFormsFramework MEthod - frameworkConfig :: ', JSON.stringify(frameworkConfig))
    // tslint:disable-next-line: no-any
    frameworkAPI.bootstrap(frameworkConfig, this.app).then((data: any) => {
      logInfo('Successfuly bootstrapped frameworkAPI', data)
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
      // tslint:disable-next-line
      console.log('res--', res);
      logInfo('CLEARING RES COOKIES', res)
      const connectSid = 'connect.sid'
    //   res.cookie(connectSid, _req.cookies[connectSid], {
    //     httpOnly: true,
    //     maxAge: CONSTANTS.KEYCLOAK_SESSION_TTL,
    //     sameSite: 'Strict',
    //     secure: true,
    //  })
      res.status(200).clearCookie(connectSid, {
        httpOnly: true,
        sameSite: "Strict",
        secure: true,
      })
      if (_req.session) {
        _req.session.destroy(() => {
          res.redirect('/apis/logout')
          })
      }
    })
  }

  // private handleShutDowns() {
  //   await frameworkAPI.closeCassandraConnections();
  // }
}
