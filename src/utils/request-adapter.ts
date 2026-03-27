/**
 * Thin adapter wrapping axios to match the deprecated `request` library API.
 *
 * This exists so call sites only change their import line while all HTTP
 * traffic flows through the shared keep-alive agents defined in request.config.ts.
 *
 * Supported patterns (from cc docs for request library):
 *   request.get({ url, headers }, callback?)
 *   request.post({ url, form }, callback?)        — form-urlencoded
 *   request.post(url, { json, headers }, callback?) — json body
 *   request.post(url, opts).pipe(res)              — streaming
 *
 * `request` callback signature: (err, response, body)
 *   - response.statusCode, response.headers, response.body
 *   - body is string (raw) or parsed object when json:true
 *
 * Intentional tech debt — migrate call sites to native axios over time,
 * then delete this file.
 */

import axios from 'axios'
import { axiosRequestConfig } from '../configs/request.config'
import { logError } from './logger'

const CONTENT_TYPE = 'Content-Type'

// tslint:disable-next-line: no-any
type Callback = (err: any, response: any, body: any) => void

// tslint:disable-next-line: interface-name
interface IRequestOptions {
  url?: string
  // tslint:disable-next-line: no-any
  headers?: Record<string, any>
  // tslint:disable-next-line: no-any
  form?: Record<string, any>
  json?: any  // tslint:disable-line: no-any
  body?: any  // tslint:disable-line: no-any
  [key: string]: any  // tslint:disable-line: no-any
}

/**
 * Resolve URL and options from the overloaded argument patterns.
 */
function resolveArgs(urlOrOpts: string | IRequestOptions, optsOrCb?: IRequestOptions | Callback) {
  let url: string
  let opts: IRequestOptions = {}

  if (typeof urlOrOpts === 'string') {
    url = urlOrOpts
    if (optsOrCb && typeof optsOrCb !== 'function') {
      opts = optsOrCb
    }
  } else {
    opts = urlOrOpts
    url = opts.url || ''
  }

  return { opts, url }
}

/**
 * Build an axios config from request-library-style options.
 */
// tslint:disable-next-line: no-any
function buildAxiosConfig(method: string, urlOrOpts: string | IRequestOptions, optsOrCb?: IRequestOptions | Callback): any {
  const { url, opts } = resolveArgs(urlOrOpts, optsOrCb)

  // tslint:disable-next-line: no-any
  const axiosCfg: any = {
    ...axiosRequestConfig,
    headers: { ...(opts.headers || {}) },
    method,
    url,
  }

  if (opts.form) {
    axiosCfg.data = new URLSearchParams(opts.form).toString()
    axiosCfg.headers[CONTENT_TYPE] = 'application/x-www-form-urlencoded'
  } else if (opts.json && typeof opts.json !== 'boolean') {
    axiosCfg.data = opts.json
    axiosCfg.headers[CONTENT_TYPE] = 'application/json'
  } else if (opts.json === true && opts.body) {
    axiosCfg.data = opts.body
    axiosCfg.headers[CONTENT_TYPE] = 'application/json'
  }

  return axiosCfg
}

/**
 * Determine if caller expects parsed JSON response.
 */
function isJsonMode(urlOrOpts: string | IRequestOptions, optsOrCb?: IRequestOptions | Callback): boolean {
  if (typeof urlOrOpts !== 'string' && urlOrOpts.json) {
    return true
  }
  if (optsOrCb && typeof optsOrCb !== 'function' && optsOrCb.json) {
    return true
  }
  return false
}

/**
 * Handle the axios response and invoke callback with request-lib signature.
 */
// tslint:disable-next-line: no-any
function handleResponse(response: any, jsonMode: boolean, callback: Callback) {
  // tslint:disable-next-line: no-any
  let body: any
  if (jsonMode) {
    body = response.data
  } else {
    body = typeof response.data === 'object'
      ? JSON.stringify(response.data)
      : response.data
  }

  const res = {
    body: response.data,
    headers: response.headers,
    statusCode: response.status,
  }
  callback(null, res, body)
}

/**
 * Attach .pipe() support to a promise for streaming responses.
 */
// tslint:disable-next-line: no-any
function attachPipe(promise: Promise<any>, axiosCfg: any): any {
  // tslint:disable-next-line: no-any
  const pipeable: any = promise
  pipeable.pipe = (destination: NodeJS.WritableStream) => {
    axios({ ...axiosCfg, responseType: 'stream' })
      .then((response) => {
        response.data.pipe(destination)
      })
      .catch((err) => {
        logError('request-adapter pipe error:', String(err.message || err))
        // tslint:disable-next-line: no-any
        const dest = destination as any
        if (dest.status) {
          dest.status(502).send({ error: 'Upstream request failed' })
        }
      })
    return destination
  }
  return pipeable
}

/**
 * Execute request and invoke callback with request-lib (err, response, body) signature.
 */
function execute(method: string, urlOrOpts: string | IRequestOptions, optsOrCb?: IRequestOptions | Callback, cb?: Callback) {
  const callback = typeof optsOrCb === 'function' ? optsOrCb : cb
  const axiosCfg = buildAxiosConfig(method, urlOrOpts, optsOrCb)
  const jsonMode = isJsonMode(urlOrOpts, optsOrCb)

  const promise = axios(axiosCfg)
    .then((response) => {
      if (callback) {
        handleResponse(response, jsonMode, callback)
      }
    })
    .catch((err) => {
      if (callback) {
        callback(err, null, null)
      } else {
        logError('request-adapter fire-and-forget error:', String(err.message || err))
      }
    })

  return attachPipe(promise, axiosCfg)
}

// tslint:disable-next-line: no-any
export const request: any = {
  get(urlOrOpts: string | IRequestOptions, optsOrCb?: IRequestOptions | Callback, cb?: Callback) {
    return execute('GET', urlOrOpts, optsOrCb, cb)
  },
  post(urlOrOpts: string | IRequestOptions, optsOrCb?: IRequestOptions | Callback, cb?: Callback) {
    return execute('POST', urlOrOpts, optsOrCb, cb)
  },
}
