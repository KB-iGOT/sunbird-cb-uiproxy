/**
 * Test: body parsing runs after auth — unauthenticated requests skip parsing.
 *
 * Simulates the server.ts middleware order: keycloak.protect on routes,
 * body parsers inside routers (not global).
 *
 * Run: node tests/test-body-parse-order.mjs
 */

import http from 'node:http'
import assert from 'node:assert/strict'
import express from 'express'

const PORT = 19897

const app = express()

// --- Mock keycloak protect: reject if no Authorization header ---
function mockKeycloakProtect(req, res, next) {
  if (!req.headers.authorization || req.headers.authorization !== 'Bearer valid-token') {
    res.status(401).json({ error: 'Unauthorized', bodyWasParsed: !!req._body })
    return
  }
  next()
}

// --- Public router with its own body parser ---
const publicRouter = express.Router()
publicRouter.use(express.json({ limit: '50mb' }))
publicRouter.post('/search', (req, res) => {
  res.json({ parsed: !!req._body, body: req.body })
})
app.use('/public/v8', publicRouter)

// --- Protected router: body parser INSIDE router, keycloak.protect on mount ---
const protectedRouter = express.Router()
protectedRouter.use(express.json({ limit: '50mb' }))
protectedRouter.post('/user', (req, res) => {
  res.json({ parsed: !!req._body, body: req.body })
})
app.use('/protected/v8', mockKeycloakProtect, protectedRouter)

// NO global body parser — matches the new server.ts layout

const server = await new Promise(resolve => {
  const s = app.listen(PORT, () => resolve(s))
})

function post(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body)
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    }, (res) => {
      let respBody = ''
      res.on('data', c => respBody += c)
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(respBody) }))
    })
    req.on('error', reject)
    req.write(data)
    req.end()
  })
}

// =========================================================
// Test 1: Unauthenticated → protected route — rejected, body NOT parsed
// =========================================================
const r1 = await post('/protected/v8/user', { name: 'test' })
assert.equal(r1.status, 401, 'Should be rejected')
assert.equal(r1.body.bodyWasParsed, false, 'Body should NOT be parsed before auth rejection')
console.log('✅ Unauthenticated protected request: rejected without body parsing')

// =========================================================
// Test 2: Authenticated → protected route — body parsed after auth
// =========================================================
const r2 = await post('/protected/v8/user', { name: 'test' }, { Authorization: 'Bearer valid-token' })
assert.equal(r2.status, 200, 'Should succeed')
assert.equal(r2.body.parsed, true, 'Body should be parsed')
assert.equal(r2.body.body.name, 'test', 'Body content should match')
console.log('✅ Authenticated protected request: body parsed correctly')

// =========================================================
// Test 3: Public route — body parsed without auth
// =========================================================
const r3 = await post('/public/v8/search', { query: 'hello' })
assert.equal(r3.status, 200, 'Should succeed')
assert.equal(r3.body.parsed, true, 'Body should be parsed by route-level parser')
assert.equal(r3.body.body.query, 'hello', 'Body content should match')
console.log('✅ Public route: body parsed without auth')

// =========================================================
console.log(`\n${'─'.repeat(50)}`)
console.log('✅ ALL PASS — body parsing skipped for unauthenticated requests')

server.close()
