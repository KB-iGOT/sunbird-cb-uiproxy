import pino from 'pino'
import { CONSTANTS } from './env'

// Configure Pino instance
// In development, keep simple formatted logs if pino-pretty isn't available,
// in production use blazing fast JSON logging
const pinoOptions = {
  formatters: {
    level: (label: string) => {
      return { level: label }
    },
  },
  level: CONSTANTS.LOG_LEVEL || 'info', ,
  timestamp: pino.stdTimeFunctions.isoTime,
}

const logger = pino(pinoOptions)

// tslint:disable-next-line: no-any
export const log = (msg: any, ...args: any[]) => {
  logger.info(msg, ...args)
}

type TObjectValueType = string | number | boolean | undefined | null
export function logObject(
  msgPrefix: string,
  obj: { [k: string]: TObjectValueType }
): void {
  const kv = Object.entries(obj)
    .map(([k, v]) => [k, String(v)])
    .sort((a, b) => a[0].localeCompare(b[0]))
  const padStart = Math.max(...kv.map(([k]) => k.length))
  const padEnd = Math.max(...kv.map(([, v]) => v.length))
  const msgArr = kv
    .map(([k, v]) => k.padStart(padStart) + ' : ' + v.padEnd(padEnd))

  logger.info(msgPrefix)
  logger.info('_'.repeat(padStart + padEnd + 3))
  msgArr.forEach((msg) => {
    logger.info(msg)
  })
}

export function logInfoHeading(msg: string) {
  logger.info(`--- ${msg} ---`)
}

export function logInfo(...msgs: string[]) {
  logger.info(msgs.join(' '))
}

export function logDebug(...msgs: string[]) {
  logger.debug(msgs.join(' '))
}

export function logWarnHeading(msg: string) {
  logger.warn(`--- ${msg} ---`)
}

export function logWarn(...msgs: string[]) {
  logger.warn(msgs.join(' '))
}

export function logErrorHeading(msg: string) {
  logger.error(`--- ${msg} ---`)
}

export function logError(...msgs: string[]) {
  logger.error(msgs.join(' '))
}

export function logSuccessHeading(msg: string) {
  logger.info(`[SUCCESS] --- ${msg} ---`)
}

export function logSuccess(...msgs: string[]) {
  logger.info(`[SUCCESS] ${msgs.join(' ')}`)
}
