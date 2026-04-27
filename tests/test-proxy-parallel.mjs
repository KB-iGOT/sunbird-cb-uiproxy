/**
 * Test: singleton proxy handles parallel requests concurrently.
 *
 * Proves that a single proxy instance doesn't serialize requests —
 * 100 parallel requests complete in roughly the same time as 1.
 *
 * Run: npx tsx tests/test-proxy-parallel.mjs
 */

import http from 'node:http'
import assert from 'node:assert/strict'
import httpProxy from 'http-proxy'

const UPSTREAM_PORT = 19885
const PROXY_PORT = 19886
const PARALLEL = 100
const UPSTREAM_DELAY_MS = 200  // each upstream request takes 200ms

let concurrentMax = 0
let concurrentNow = 0

// --- Upstream: delays 200ms, tracks concurrency ---
const upstream = http.createServer((req, res) => {
  concurrentNow++
  if (concurrentNow > concurrentMax) {
    concurrentMax = concurrentNow
  }
  setTimeout(() => {
    concurrentNow--
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('ok')
  }, UPSTREAM_DELAY_MS)
})

await new Promise(resolve => upstream.listen(UPSTREAM_PORT, resolve))

// --- Singleton proxy ---
const proxyTimed = httpProxy.createProxyServer({ timeout: 10000 })
proxyTimed.on('error', () => {})

const server = http.createServer((req, res) => {
  proxyTimed.web(req, res, { target: `http://127.0.0.1:${UPSTREAM_PORT}` })
})
await new Promise(resolve => server.listen(PROXY_PORT, resolve))

// --- Fire 100 requests in parallel ---
const sendRequest = () => new Promise((resolve, reject) => {
  const req = http.request({ hostname: '127.0.0.1', port: PROXY_PORT, path: '/', method: 'GET' }, (res) => {
    let body = ''
    res.on('data', c => body += c)
    res.on('end', () => resolve({ status: res.statusCode }))
  })
  req.on('error', reject)
  req.end()
})

console.log(`Sending ${PARALLEL} parallel requests (upstream delay: ${UPSTREAM_DELAY_MS}ms each)\n`)

const start = Date.now()
const results = await Promise.all(Array.from({ length: PARALLEL }, () => sendRequest()))
const elapsed = Date.now() - start

const allOk = results.every(r => r.status === 200)

console.log(`  All 200 OK:         ${allOk ? '✅' : '❌'}`)
console.log(`  Peak concurrency:   ${concurrentMax} (of ${PARALLEL})`)
console.log(`  Total time:         ${elapsed}ms`)
console.log(`  If serialized:      ${PARALLEL * UPSTREAM_DELAY_MS}ms (${PARALLEL} × ${UPSTREAM_DELAY_MS}ms)`)
console.log(`  If parallel:        ~${UPSTREAM_DELAY_MS}ms`)

assert.ok(allOk, 'All requests should return 200')
assert.ok(concurrentMax >= PARALLEL * 0.5, `Peak concurrency ${concurrentMax} should be >= ${PARALLEL * 0.5}`)
assert.ok(elapsed < PARALLEL * UPSTREAM_DELAY_MS * 0.5, `Total ${elapsed}ms should be well under serialized ${PARALLEL * UPSTREAM_DELAY_MS}ms`)

console.log(`\n${'─'.repeat(50)}`)
console.log(`✅ PASS: Singleton handles ${PARALLEL} parallel requests concurrently`)
console.log(`   ${concurrentMax} concurrent upstream connections, ${elapsed}ms total`)

server.close()
upstream.close()
proxyTimed.close()
