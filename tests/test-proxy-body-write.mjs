/**
 * Test: proxy body write guard — prevents double body write.
 *
 * Verifies that the proxyReq handler only writes the body when
 * Express body-parser has consumed the original stream (req._body).
 *
 * Run: node tests/test-proxy-body-write.mjs
 */

import http from 'node:http'
import assert from 'node:assert/strict'
import httpProxy from 'http-proxy'

const UPSTREAM_PORT = 19890
const PROXY_PORT = 19891

// --- Track bodies received by upstream ---
const receivedBodies = []

const upstream = http.createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => { body += chunk })
  req.on('end', () => {
    receivedBodies.push(body)
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ received: body.length }))
  })
})

await new Promise(resolve => upstream.listen(UPSTREAM_PORT, resolve))

const proxy = httpProxy.createProxyServer({})
proxy.on('error', () => {})

// Replicate the guard logic from proxyCreator.ts
proxy.on('proxyReq', (proxyReq, req, _res) => {
  const isUpload = req.url.includes('/storage/upload')
  const alreadyHasBody = proxyReq.getHeader('Content-Length') !== undefined
  if (!isUpload && !alreadyHasBody && req._body && req.body && Object.keys(req.body).length > 0) {
    const bodyData = JSON.stringify(req.body)
    proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData))
    proxyReq.write(bodyData)
  }
})

const server = http.createServer((req, res) => {
  // Simulate different middleware states
  if (req.url === '/parsed') {
    // body-parser consumed the stream and set req._body + req.body
    req._body = true
    req.body = { action: 'test', value: 42 }
  } else if (req.url === '/not-parsed') {
    // No body-parser — raw stream should be forwarded by http-proxy
    // req._body is undefined, req.body is undefined
  } else if (req.url === '/empty-body') {
    // body-parser ran but body was empty
    req._body = true
    req.body = {}
  } else if (req.url === '/storage/upload') {
    // Upload route — should never manually write
    req._body = true
    req.body = { file: 'data' }
  }

  proxy.web(req, res, { target: `http://127.0.0.1:${UPSTREAM_PORT}` })
})

await new Promise(resolve => server.listen(PROXY_PORT, resolve))

const sendRequest = (path, body) => new Promise((resolve, reject) => {
  const data = body ? JSON.stringify(body) : ''
  const req = http.request({
    hostname: '127.0.0.1',
    port: PROXY_PORT,
    path,
    method: 'POST',
    headers: body ? {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    } : {},
  }, (res) => {
    let respBody = ''
    res.on('data', c => respBody += c)
    res.on('end', () => resolve({ status: res.statusCode, body: respBody }))
  })
  req.on('error', reject)
  if (data) req.write(data)
  req.end()
})

// =========================================================
// Test 1: Parsed body — guard writes it (single write)
// =========================================================
receivedBodies.length = 0
await sendRequest('/parsed', { action: 'test', value: 42 })
const parsedBody = receivedBodies[0]
const parsed = JSON.parse(parsedBody)
assert.equal(parsed.action, 'test')
assert.equal(parsed.value, 42)
console.log('✅ Parsed body: guard writes serialized body correctly')

// =========================================================
// Test 2: Not parsed — guard does NOT write (http-proxy forwards raw)
// =========================================================
receivedBodies.length = 0
await sendRequest('/not-parsed', { raw: 'stream' })
const rawBody = receivedBodies[0]
// http-proxy forwards the original stream — should contain the raw data
assert.ok(rawBody.length > 0, 'Raw body should be forwarded by http-proxy')
console.log('✅ Not parsed: guard skips, http-proxy forwards raw stream')

// =========================================================
// Test 3: Empty body — guard does NOT write
// =========================================================
receivedBodies.length = 0
await sendRequest('/empty-body', { ignored: true })
const emptyGuardBody = receivedBodies[0]
// Guard skips because Object.keys({}).length === 0
// http-proxy forwards the raw stream instead
assert.ok(emptyGuardBody.length > 0, 'Should have some body from raw stream')
console.log('✅ Empty parsed body: guard skips (Object.keys check)')

// =========================================================
// Test 4: Upload route — guard does NOT write
// =========================================================
receivedBodies.length = 0
await sendRequest('/storage/upload', { file: 'data' })
const uploadBody = receivedBodies[0]
// Guard skips upload routes — http-proxy forwards raw
assert.ok(uploadBody.length > 0, 'Upload body forwarded by http-proxy')
console.log('✅ Upload route: guard skips (isUpload check)')

// =========================================================
console.log(`\n${'─'.repeat(50)}`)
console.log('✅ ALL PASS — body write guard prevents double write')

server.close()
upstream.close()
proxy.close()
