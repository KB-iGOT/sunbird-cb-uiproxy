import { createHash } from 'crypto'
import { NextFunction, Request, Response } from 'express'
import { CONSTANTS } from './env'
import { logError, logInfo } from './logger'
import { redis } from './redis'

// Node exposes the browser-compatible WebCrypto API as crypto.webcrypto (runtime is Node >= 18),
// but the @types/node version in this repo predates it
// tslint:disable-next-line: no-var-requires
const subtle = require('crypto').webcrypto.subtle

// top-level browser navigations (redirects from Keycloak login etc.) can never carry
// signature headers — these paths only set cookies / redirect and return no user data
const EXEMPT_PATH_PREFIXES = [
  '/protected/v8/resource',
]

interface IJwk {
  kty: string
  crv: string
  x: string
  y: string
}

interface IBoundKey {
  boundAt: number
  jwk: IJwk
  thumbprint: string
}

interface IValidationResult {
  ok: boolean
  reason?: string
}

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

function base64UrlEncode(value: Buffer): string {
  return value.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function jwkThumbprint(jwk: IJwk): string {
  // RFC 7638: SHA-256 over the canonical JSON of the required EC members, in lexicographic order
  const canonical = JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y })
  return base64UrlEncode(createHash('sha256').update(canonical).digest())
}

async function verifySignature(jwk: IJwk, payload: string, signatureB64: string): Promise<boolean> {
  const key = await subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  return subtle.verify(
    { hash: 'SHA-256', name: 'ECDSA' },
    key,
    base64UrlDecode(signatureB64),
    Buffer.from(payload, 'utf8')
  )
}

// returns true when the nonce has not been seen inside the skew window; fails open if redis is down
async function isNonceFresh(sessionId: string, nonce: string): Promise<boolean> {
  try {
    const ttlMs = CONSTANTS.DEVICE_SIGNATURE_SKEW_MS * 2
    const result = await redis.set('devsig:' + sessionId + ':' + nonce, '1', 'PX', ttlMs, 'NX')
    return result === 'OK'
  } catch (err) {
    logError('Device signature nonce check skipped, redis unavailable: ' + err)
    return true
  }
}

function parseAndValidateHeaders(
  signature: string | undefined,
  ts: string | undefined,
  nonce: string | undefined,
  boundKey: IBoundKey | undefined
): { errorResult?: IValidationResult; tsNumber?: number } {
  if (!signature || !ts || !nonce) {
    return { errorResult: { ok: false, reason: boundKey ? 'signature-headers-missing' : 'unsigned-request-unbound-session' } }
  }
  const tsNumber = Number(ts)
  const skew = Math.abs(Date.now() - tsNumber)
  if (isNaN(skew) || skew > CONSTANTS.DEVICE_SIGNATURE_SKEW_MS) {
    return { errorResult: { ok: false, reason: 'timestamp-skew' } }
  }
  return { tsNumber }
}

function parseKeyHeader(keyHeader: string | undefined): { errorResult?: IValidationResult; headerJwk?: IJwk } {
  if (!keyHeader) {
    return {}
  }
  let headerJwk: IJwk | null = null
  try {
    headerJwk = JSON.parse(base64UrlDecode(keyHeader).toString('utf8'))
  } catch (err) {
    return { errorResult: { ok: false, reason: 'malformed-key-header' } }
  }
  if (!headerJwk || headerJwk.kty !== 'EC' || headerJwk.crv !== 'P-256' || !headerJwk.x || !headerJwk.y) {
    return { errorResult: { ok: false, reason: 'unsupported-key-type' } }
  }
  return { headerJwk }
}

function determineJwk(boundKey: IBoundKey | undefined, headerJwk: IJwk | undefined): { errorResult?: IValidationResult; jwk?: IJwk } {
  if (boundKey) {
    // session already bound: the stored key is authoritative; a different key in the header is a hijack signal
    if (headerJwk && jwkThumbprint(headerJwk) !== boundKey.thumbprint) {
      return { errorResult: { ok: false, reason: 'key-mismatch' } }
    }
    return { jwk: boundKey.jwk }
  } else {
    if (!headerJwk) {
      return { errorResult: { ok: false, reason: 'key-header-missing' } }
    }
    return { jwk: headerJwk }
  }
}

async function validate(req: Request): Promise<IValidationResult> {
  const signature = req.header('x-device-signature')
  const ts = req.header('x-device-ts')
  const nonce = req.header('x-device-nonce')
  const keyHeader = req.header('x-device-key')
  // tslint:disable-next-line: no-any
  const session = req.session as any
  // the session cookie spans all subdomains (spv/cbp/mdo/...), but browser crypto keys are
  // per-origin — so each subdomain host binds and validates its own key within the session
  const host = req.hostname || ''
  const deviceKeys = (session.deviceKeys || {}) as { [h: string]: IBoundKey }
  const boundKey = deviceKeys[host]

  const headerValidation = parseAndValidateHeaders(signature, ts, nonce, boundKey)
  if (headerValidation.errorResult) {
    return headerValidation.errorResult
  }

  const keyHeaderValidation = parseKeyHeader(keyHeader)
  if (keyHeaderValidation.errorResult) {
    return keyHeaderValidation.errorResult
  }
  const headerJwk = keyHeaderValidation.headerJwk

  const jwkValidation = determineJwk(boundKey, headerJwk)
  if (jwkValidation.errorResult) {
    return jwkValidation.errorResult
  }
  const jwk = jwkValidation.jwk

  // the SPA signs the URL without the /apis prefix (stripped by ingress), matching req.originalUrl here
  const payload = req.method + '|' + req.originalUrl + '|' + ts + '|' + nonce
  let verified = false
  try {
    verified = await verifySignature(jwk!, payload, signature!)
  } catch (err) {
    logError('Device signature verify error: ' + err)
    return { ok: false, reason: 'signature-verify-error' }
  }
  if (!verified) {
    return { ok: false, reason: 'invalid-signature' }
  }
  if (!(await isNonceFresh(req.sessionID || '', nonce!))) {
    return { ok: false, reason: 'nonce-replay' }
  }
  if (!boundKey) {
    // trust-on-first-use: bind this browser's public key to the session for this host
    // on its first valid signed request
    deviceKeys[host] = { boundAt: Date.now(), jwk: jwk!, thumbprint: jwkThumbprint(jwk!) }
    session.deviceKeys = deviceKeys
    logInfo('Device key bound to session ' + req.sessionID + ' host ' + host +
      ' thumbprint ' + deviceKeys[host].thumbprint)
  }
  return { ok: true }
}

// only active-forgery signals kill the session; a merely unsigned request (e.g. a portal that
// hasn't been onboarded yet, sharing the domain-wide cookie) is rejected without collateral damage
const SESSION_KILL_REASONS = ['key-mismatch', 'invalid-signature', 'nonce-replay']

function handleFailure(req: Request, res: Response, next: NextFunction, reason: string | undefined, mode: string) {
  const detail = 'reason=' + reason + ' session=' + req.sessionID +
    ' url=' + req.method + ' ' + req.originalUrl
  if (mode === 'log') {
    logError('Device signature validation failed (log mode, allowing): ' + detail)
    next()
    return
  }
  if (req.session && reason && SESSION_KILL_REASONS.indexOf(reason) >= 0) {
    logError('Device signature validation failed (enforce mode, rejecting and destroying session): ' + detail)
    req.session.destroy(() => {
      res.status(419).json({ error: 'Device signature validation failed' })
    })
    return
  }
  logError('Device signature validation failed (enforce mode, rejecting): ' + detail)
  res.status(419).json({ error: 'Device signature validation failed' })
}

// 'enforce' applies only to hosts listed in DEVICE_SIGNATURE_ENFORCED_HOSTS (all hosts when
// the list is empty); other hosts are downgraded to 'log' so portals can be onboarded one at a time
function effectiveMode(host: string): string {
  const mode = CONSTANTS.DEVICE_SIGNATURE_MODE
  if (mode !== 'enforce') {
    return mode
  }
  const enforcedHosts = CONSTANTS.DEVICE_SIGNATURE_ENFORCED_HOSTS
    .split(',').map((h: string) => h.trim().toLowerCase()).filter((h: string) => h.length > 0)
  if (enforcedHosts.length === 0 || enforcedHosts.indexOf(host.toLowerCase()) >= 0) {
    return 'enforce'
  }
  return 'log'
}

export function deviceSignatureValidator() {
  return (req: Request, res: Response, next: NextFunction) => {
    const mode = effectiveMode(req.hostname || '')
    if (mode !== 'log' && mode !== 'enforce') {
      next()
      return
    }
    if (req.originalUrl.toLowerCase().includes('public') || !req.session) {
      next()
      return
    }
    const pathname = req.originalUrl.split('?')[0]
    if (EXEMPT_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      next()
      return
    }
    validate(req)
      .then((result) => {
        if (result.ok) {
          next()
        } else {
          handleFailure(req, res, next, result.reason, mode)
        }
      })
      .catch((err) => {
        // unexpected internal error: fail open so a validator bug cannot take the portal down
        logError('Device signature validator error, allowing request: ' + err)
        next()
      })
  }
}
