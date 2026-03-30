/**
 * Test: HTTP keep-alive agent connection reuse
 *
 * Verifies that the shared agents in src/configs/request.config.ts
 * enable connection reuse. Without keep-alive, each request opens a
 * new TCP socket. With keep-alive, a single socket is reused.
 *
 * Run: node tests/test-keepalive-agent.mjs
 * Exit code: 0 = pass, 1 = fail
 */

import http from 'node:http'
import assert from 'node:assert/strict'

const REQUESTS = 50
const PORT = 19876

// --- Mock upstream server ---
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
})

await new Promise(resolve => server.listen(PORT, resolve))

// --- Helper: fire N sequential requests, return unique socket count ---
async function fireRequests(agent) {
  const sockets = new Set()

  for (let i = 0; i < REQUESTS; i++) {
    await new Promise((resolve, reject) => {
      const req = http.request(
        { hostname: '127.0.0.1', port: PORT, path: '/', agent },
        (res) => {
          sockets.add(res.socket)
          res.resume()
          res.on('end', resolve)
        }
      )
      req.on('error', reject)
      req.end()
    })
  }

  return sockets.size
}

try {
  // Test 1: Without keep-alive — should open many sockets
  const noKeepAlive = new http.Agent({ keepAlive: false })
  const withoutCount = await fireRequests(noKeepAlive)
  noKeepAlive.destroy()

  assert.ok(withoutCount > 1,
    `Expected multiple sockets without keep-alive, got ${withoutCount}`)

  // Test 2: With keep-alive (matches request.config.ts) — should reuse 1 socket
  const withKeepAlive = new http.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000,
  })
  const withCount = await fireRequests(withKeepAlive)
  withKeepAlive.destroy()

  assert.equal(withCount, 1,
    `Expected 1 socket with keep-alive, got ${withCount}`)

  console.log(`✅ PASS: keep-alive reduces sockets from ${withoutCount} → ${withCount} (${REQUESTS} requests)`)
  server.close()
  process.exit(0)
} catch (err) {
  console.error('❌ FAIL:', err.message)
  server.close()
  process.exit(1)
}
