/**
 * Integration test: Verify POST body forwarding with keep-alive agent.
 *
 * Proves the fix for the http-proxy race condition where queued requests
 * (keep-alive agent pool exhausted) lost their POST body.
 *
 * Tests:
 *  1. POST with keep-alive agent → body arrives at upstream
 *  2. GET  with keep-alive agent → response returned
 *  3. Concurrent POSTs exceeding maxSockets → all bodies delivered
 *
 * Run: node tests/test-proxy-keepalive-body.mjs
 */

import http from 'node:http'
import { Readable } from 'node:stream'
import httpProxy from 'http-proxy'
const { createProxyServer } = httpProxy

const TIMEOUT_MS = 10000
let exitCode = 0
let testsRun = 0
let testsPassed = 0

function assert(condition, msg) {
  testsRun++
  if (condition) {
    testsPassed++
    console.log(`  ✅ ${msg}`)
  } else {
    exitCode = 1
    console.log(`  ❌ ${msg}`)
  }
}

/**
 * Replicates the fix: build a Readable buffer from parsed body.
 * Mirrors buildProxyBuffer() in proxyCreator.ts.
 */
function buildProxyBuffer(req) {
  if (!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) {
    return undefined
  }
  const bodyData = JSON.stringify(req.body)
  req.headers['content-length'] = String(Buffer.byteLength(bodyData))
  delete req.headers['transfer-encoding']
  const stream = new Readable({ read() {} })
  stream.push(bodyData)
  stream.push(null)
  return stream
}

async function runTests() {
  // --- Upstream: echoes back body ---
  const upstream = http.createServer((req, res) => {
    let body = ''
    req.on('data', (d) => body += d)
    const timer = setTimeout(() => {
      res.writeHead(504)
      res.end(JSON.stringify({ error: 'body timeout', received: body.length }))
    }, 3000)
    req.on('end', () => {
      clearTimeout(timer)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ method: req.method, bodyLength: body.length, body, cl: req.headers['content-length'] }))
    })
  })

  await new Promise(r => upstream.listen(0, r))
  const upPort = upstream.address().port

  // --- Proxy with keep-alive agent, maxSockets=1 to force queueing ---
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 })
  const proxy = createProxyServer({})
  proxy.on('error', (err, _req, res) => {
    if (res && !res.headersSent) { res.writeHead(502); res.end('proxy error: ' + err.message) }
  })

  // --- App: parses body, then proxies with buffer (the fix) ---
  const app = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (d) => raw += d)
    req.on('end', () => {
      if (raw) { try { req.body = JSON.parse(raw) } catch (_e) { /* noop */ } }
      proxy.web(req, res, {
        target: `http://127.0.0.1:${upPort}`,
        agent,
        buffer: buildProxyBuffer(req),
      })
    })
  })

  await new Promise(r => app.listen(0, r))
  const appPort = app.address().port

  function makeRequest(method, path, body) {
    return new Promise((resolve, reject) => {
      const headers = { 'content-type': 'application/json' }
      const bodyStr = body ? JSON.stringify(body) : undefined
      if (bodyStr) { headers['content-length'] = String(Buffer.byteLength(bodyStr)) }
      const req = http.request({ host: '127.0.0.1', port: appPort, method, path, headers }, (res) => {
        let data = ''
        res.on('data', (d) => data += d)
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }) }
          catch (_e) { resolve({ status: res.statusCode, data }) }
        })
      })
      req.on('error', reject)
      if (bodyStr) { req.write(bodyStr) }
      req.end()
    })
  }

  // --- Test 1: Single POST with keep-alive ---
  console.log('\nTest 1: POST with keep-alive agent')
  const r1 = await makeRequest('POST', '/test-single', { search: 'hello' })
  assert(r1.status === 200, `status 200 (got ${r1.status})`)
  assert(r1.data.bodyLength > 0, `body arrived (${r1.data.bodyLength} bytes)`)
  assert(r1.data.body.includes('hello'), `body contains "hello"`)

  // --- Test 2: GET with keep-alive ---
  console.log('\nTest 2: GET with keep-alive agent')
  const r2 = await makeRequest('GET', '/test-get', null)
  assert(r2.status === 200, `status 200 (got ${r2.status})`)
  assert(r2.data.method === 'GET', `method is GET`)

  // --- Test 3: 5 concurrent POSTs with maxSockets=1 ---
  console.log('\nTest 3: 5 concurrent POSTs (maxSockets=1, forces queueing)')
  const concurrent = await Promise.all(
    Array.from({ length: 5 }, (_, i) => makeRequest('POST', `/test-concurrent-${i}`, { id: i, payload: `data-${i}` }))
  )
  const allOk = concurrent.every(r => r.status === 200)
  const allBodies = concurrent.every(r => r.data.bodyLength > 0)
  assert(allOk, `all 5 returned 200 (got [${concurrent.map(r => r.status)}])`)
  assert(allBodies, `all 5 bodies arrived (lengths: [${concurrent.map(r => r.data.bodyLength)}])`)
  for (let i = 0; i < 5; i++) {
    const parsed = JSON.parse(concurrent[i].data.body)
    assert(parsed.id === i, `request ${i} body has correct id=${i}`)
  }

  // --- Cleanup ---
  upstream.close()
  app.close()
  agent.destroy()

  console.log(`\n${testsPassed}/${testsRun} tests passed`)
  process.exit(exitCode)
}

setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, TIMEOUT_MS)
runTests().catch((e) => { console.error(e); process.exit(1) })
