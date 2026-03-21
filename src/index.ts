import { Server } from './server'

// Code to inject axios retry logic
import './utils/axios-retry'
import { log, logSuccess, logWarnHeading } from './utils/logger'

Server.bootstrap()
logSuccess(`Worker started with process Id ${process.pid}`)

process
  .on('unhandledRejection', (reason, p) => {
    logWarnHeading('Unhandled Rejection')
    log(reason, p)
  })
  .on('uncaughtException', (err) => {
    logWarnHeading('Un caught exception')
    log(err)
  })
