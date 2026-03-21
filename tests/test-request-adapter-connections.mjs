/**
 * Stress test: request-adapter connection reuse
 *
 * Proves that the adapter routes all traffic through the shared
 * keep-alive agent — N requests should reuse a small number of
 * sockets, not open N new connections.
 *
 * Run: npx tsx tests/test-request-adapter-connections.mjs
 * Exit code: 0 = pass, 1 = fail
 */

import http from 'node:http'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

let request
try {
  const mod = require(path.join(__dirname, '..', 'dist', 'utils', 'request-adapter.js'))
  request = mod.request
} catch (err) {
  console.error('Cannot import request-adapter. Build first: npm run build')
  console.error(err.message)
  process.exit(1)
}

const REQUESTS = 50
const PORT = 19878

// --- Mock server that tracks unique sockets ---
const serverSockets = new Set()
const server = http.createServer((req, res) => {
  serverSockets.add(req.socket)
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: true }))
})

await new Promise(resolve => server.listen(PORT, resolve))
console.log(`Mock server on :${PORT}\n`)

// --- Fire N sequential requests through the adapter ---
async function fireRequests(label, method, opts) {
  serverSockets.clear()

  for (let i = 0; i < REQUESTS; i++) {
    await new Promise((resolve, reject) => {
      const cb = (err, res, body) => {
        if (err) reject(err)
        else resolve()
      }
      if (method === 'get') {
        request.get(opts(), cb)
      } else {
        request.post(opts(), cb)
      }
    })
  }

  const count = serverSockets.size
  console.log(`[${label}]`)
  console.log(`  Requests:       ${REQUESTS}`)
  console.log(`  Server sockets: ${count}`)
  console.log(`  Reuse:          ${count <= 3 ? '✅' : '❌'} (${count} unique)`)
  console.log()
  return count
}

// --- Test GET callback pattern (permissionHelper) ---
const getSockets = await fireRequests(
  'GET callback (permissionHelper pattern)',
  'get',
  () => ({ url: `http://127.0.0.1:${PORT}/`, headers: { Authorization: 'test' } })
)

// --- Test POST form pattern (keycloak logout) ---
const postFormSockets = await fireRequests(
  'POST form (keycloak pattern)',
  'post',
  () => ({ url: `http://127.0.0.1:${PORT}/`, form: { client_id: 'portal', token: 'abc' } })
)

// --- Test POST json pattern (details.ts) ---
const postJsonSockets = await fireRequests(
  'POST json (details.ts pattern)',
  'post',
  () => ({ url: `http://127.0.0.1:${PORT}/`, json: { user: 'test' } })
)

// --- Summary ---
console.log('─'.repeat(50))

try {
  assert.ok(getSockets <= 3, `GET: expected ≤3 sockets, got ${getSockets}`)
  assert.ok(postFormSockets <= 3, `POST form: expected ≤3 sockets, got ${postFormSockets}`)
  assert.ok(postJsonSockets <= 3, `POST json: expected ≤3 sockets, got ${postJsonSockets}`)
  console.log(`✅ PASS: All patterns reuse connections (${REQUESTS} requests each)`)
  console.log(`   GET:       ${getSockets} sockets`)
  console.log(`   POST form: ${postFormSockets} sockets`)
  console.log(`   POST json: ${postJsonSockets} sockets`)
} catch (err) {
  console.log(`❌ FAIL: ${err.message}`)
  server.close()
  process.exit(1)
}

server.close()
