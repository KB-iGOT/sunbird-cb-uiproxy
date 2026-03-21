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

// tslint:disable-next-line: no-any
type Callback = (err: any, response: any, body: any) => void

interface RequestOptions {
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
 * Build an axios config from request-library-style options.
 *
 * Per cc docs for `request`:
 *   - { form: data } → urlencoded body + Content-Type header
 *   - { json: true } → parse response as JSON, set Content-Type
 *   - { json: <object> } → use as body, set Content-Type
 *   - { body: <data>, json: true } → stringify body as JSON
 */
function buildAxiosConfig(method: string, urlOrOpts: string | RequestOptions, optsOrCb?: RequestOptions | Callback) {
  let url: string
  let opts: RequestOptions = {}

  if (typeof urlOrOpts === 'string') {
    url = urlOrOpts
    if (optsOrCb && typeof optsOrCb !== 'function') {
      opts = optsOrCb
    }
  } else {
    opts = urlOrOpts
    url = opts.url || ''
  }

  // tslint:disable-next-line: no-any
  const axiosCfg: any = {
    ...axiosRequestConfig,
    headers: { ...(opts.headers || {}) },
    method,
    url,
  }

  // { form: data } — url-encoded body
  if (opts.form) {
    axiosCfg.data = new URLSearchParams(opts.form).toString()
    axiosCfg.headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  // { json: <object> } — object is the body (not boolean true)
  // { json: true, body: <data> } — body is separate, json means serialize+parse
  if (opts.json && typeof opts.json !== 'boolean') {
    axiosCfg.data = opts.json
    axiosCfg.headers['Content-Type'] = 'application/json'
  } else if (opts.json === true && opts.body) {
    axiosCfg.data = opts.body
    axiosCfg.headers['Content-Type'] = 'application/json'
  }

  return axiosCfg
}

/**
 * Execute request and invoke callback with request-lib (err, response, body) signature.
 */
function execute(method: string, urlOrOpts: string | RequestOptions, optsOrCb?: RequestOptions | Callback, cb?: Callback) {
  const callback = typeof optsOrCb === 'function' ? optsOrCb : cb

  const axiosCfg = buildAxiosConfig(method, urlOrOpts, optsOrCb)

  // Determine if caller expects parsed JSON (json:true or json:<object>)
  let jsonMode = false
  if (typeof urlOrOpts !== 'string' && urlOrOpts.json) {
    jsonMode = true
  } else if (optsOrCb && typeof optsOrCb !== 'function' && optsOrCb.json) {
    jsonMode = true
  }

  const promise = axios(axiosCfg)
    .then((response) => {
      if (callback) {
        // request lib: body is string unless json mode, then it's parsed object
        let body: any  // tslint:disable-line: no-any
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
    })
    .catch((err) => {
      if (callback) {
        callback(err, null, null)
      } else {
        logError('request-adapter fire-and-forget error:', String(err.message || err))
      }
    })

  // Support .pipe() for streaming (per axios docs: responseType: 'stream')
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

export const request = {
  get(urlOrOpts: string | RequestOptions, optsOrCb?: RequestOptions | Callback, cb?: Callback) {
    return execute('GET', urlOrOpts, optsOrCb, cb)
  },
  post(urlOrOpts: string | RequestOptions, optsOrCb?: RequestOptions | Callback, cb?: Callback) {
    return execute('POST', urlOrOpts, optsOrCb, cb)
  },
}

export default request
