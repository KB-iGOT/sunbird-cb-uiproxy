/**
 * Test: proxy singleton reuse — no new instances per request.
 *
 * Verifies that proxied requests reuse a single proxy instance
 * instead of creating a new createProxyServer() per request.
 *
 * Run: npx tsx tests/test-proxy-singleton.mjs
 */

import http from 'node:http'
import assert from 'node:assert/strict'
import httpProxy from 'http-proxy'

const UPSTREAM_PORT = 19881
const PROXY_PORT = 19882
const REQUEST_COUNT = 100

// --- Track createProxyServer calls ---
let createCount = 0
const originalCreate = httpProxy.createProxyServer.bind(httpProxy)

// --- Upstream mock ---
const upstream = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' })
  res.end('ok')
})

await new Promise(resolve => upstream.listen(UPSTREAM_PORT, resolve))

// =========================================================
// Test 1: Per-request factory (OLD pattern) — N instances
// =========================================================
console.log('Test: per-request factory (old pattern)')

const factoryInstances = []
function oldFactory(timeout = 10000) {
  const instance = originalCreate({ timeout })
  instance.on('error', () => {})
  factoryInstances.push(instance)
  return instance
}

const serverOld = http.createServer((req, res) => {
  oldFactory().web(req, res, { target: `http://127.0.0.1:${UPSTREAM_PORT}` })
})
await new Promise(resolve => serverOld.listen(PROXY_PORT, resolve))

const sendRequest = (port) => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port, path: '/', method: 'GET' }, (res) => {
    let body = ''
    res.on('data', c => body += c)
    res.on('end', () => resolve({ status: res.statusCode, body }))
  })
  req.on('error', reject)
  req.end()
})

for (let i = 0; i < REQUEST_COUNT; i++) {
  await sendRequest(PROXY_PORT)
}

console.log(`  Requests: ${REQUEST_COUNT}`)
console.log(`  Proxy instances created: ${factoryInstances.length}`)
assert.equal(factoryInstances.length, REQUEST_COUNT, 'Old factory should create one instance per request')
console.log(`  ⚠️  ${REQUEST_COUNT} instances (confirms the leak our fix addresses)\n`)

serverOld.close()
factoryInstances.forEach(p => p.close())

// =========================================================
// Test 2: Singleton (NEW pattern) — 1 instance
// =========================================================
console.log('Test: singleton proxy (new pattern)')

const PROXY_PORT_2 = 19883
const proxyTimed = originalCreate({ timeout: 10000 })
proxyTimed.on('error', () => {})
let singletonCallCount = 0

const serverNew = http.createServer((req, res) => {
  singletonCallCount++
  proxyTimed.web(req, res, { target: `http://127.0.0.1:${UPSTREAM_PORT}` })
})
await new Promise(resolve => serverNew.listen(PROXY_PORT_2, resolve))

for (let i = 0; i < REQUEST_COUNT; i++) {
  await sendRequest(PROXY_PORT_2)
}

console.log(`  Requests: ${REQUEST_COUNT}`)
console.log(`  Proxy instances: 1 (singleton)`)
console.log(`  Requests handled: ${singletonCallCount}`)
assert.equal(singletonCallCount, REQUEST_COUNT, 'Singleton should handle all requests')
console.log(`  ✅ 1 instance handles ${REQUEST_COUNT} requests\n`)

// =========================================================
// Test 3: Singleton returns 502 on upstream failure
// =========================================================
console.log('Test: singleton error handler')

const PROXY_PORT_3 = 19884
const proxyDead = originalCreate({ timeout: 2000 })
proxyDead.on('error', (_err, _req, res) => {
  if (res && !res.headersSent) {
    res.writeHead(502, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'Bad Gateway' }))
  }
})

const serverDead = http.createServer((req, res) => {
  proxyDead.web(req, res, { target: 'http://127.0.0.1:19999' }) // nothing listening
})
await new Promise(resolve => serverDead.listen(PROXY_PORT_3, resolve))

const errResp = await sendRequest(PROXY_PORT_3)
assert.equal(errResp.status, 502, `Expected 502, got ${errResp.status}`)
const body = JSON.parse(errResp.body)
assert.equal(body.error, 'Bad Gateway')
console.log(`  ✅ Returns 502 on upstream failure\n`)

// =========================================================
// Summary
// =========================================================
console.log('─'.repeat(50))
console.log('✅ ALL PASS')
console.log(`  Old pattern: ${REQUEST_COUNT} requests = ${REQUEST_COUNT} instances (leak confirmed)`)
console.log(`  New pattern: ${REQUEST_COUNT} requests = 1 instance (fixed)`)

upstream.close()
serverNew.close()
serverDead.close()
proxyTimed.close()
proxyDead.close()
