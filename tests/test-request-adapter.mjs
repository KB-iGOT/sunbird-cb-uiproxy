/**
 * Test: request-adapter.ts — verifies the wrapper matches
 * the exact calling patterns used across 6 source files.
 *
 * Spins up a mock server and tests each pattern against it.
 *
 * Run: node tests/test-request-adapter.mjs
 * Exit code: 0 = all pass, 1 = failure
 */

import http from 'node:http'
import assert from 'node:assert/strict'
import { Writable } from 'node:stream'

// --- Import adapter ---
// Compiled dist is CommonJS — use createRequire to load it.
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

const PORT = 19877
let server

// --- Mock upstream server ---
function startServer() {
  return new Promise(resolve => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', c => body += c)
      req.on('end', () => {
        const route = req.url

        if (route === '/json-response') {
          // Returns JSON — used by P1 (permissionHelper), P3 (keycloak-user-creation)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ result: { response: { id: 'u123', responseCode: 'OK' } } }))
        }

        else if (route === '/form-echo') {
          // Echoes back the received form data — used by P2, P3
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ received: body, contentType: req.headers['content-type'] }))
        }

        else if (route === '/json-body') {
          // Echoes back JSON body — used by P4 (details.ts)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          const parsed = JSON.parse(body)
          res.end(JSON.stringify({ user: { email: 'test@test.com' }, echo: parsed }))
        }

        else if (route === '/stream') {
          // Returns streamed data — used by P5 (content.ts pipe)
          res.writeHead(200, { 'Content-Type': 'application/octet-stream' })
          res.write('chunk1')
          res.write('chunk2')
          res.end('chunk3')
        }

        else {
          res.writeHead(404)
          res.end('not found')
        }
      })
    })
    server.listen(PORT, resolve)
  })
}

// --- Test helpers ---
let passed = 0
let failed = 0

async function test(name, fn) {
  try {
    await fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${name}`)
    console.error(`     ${err.message}`)
    failed++
  }
}

// =========================================================
// TESTS
// =========================================================

await startServer()
console.log(`Mock server on :${PORT}\n`)

// ---------------------------------------------------------
// P1: request.get({url, headers}, callback)
//     permissionHelper: body is STRING, caller does JSON.parse(body)
// ---------------------------------------------------------
console.log('P1: GET with callback — body as string')

await test('callback receives string body that JSON.parse can parse', () => {
  return new Promise((resolve, reject) => {
    request.get({
      url: `http://127.0.0.1:${PORT}/json-response`,
      headers: { 'X-Test': 'true' },
    }, (err, res, body) => {
      try {
        assert.equal(err, null, 'err should be null')
        assert.equal(typeof body, 'string', 'body should be string (not object)')
        const parsed = JSON.parse(body)
        assert.equal(parsed.result.response.id, 'u123')
        resolve()
      } catch (e) { reject(e) }
    })
  })
})

await test('callback response has .statusCode and .body', () => {
  return new Promise((resolve, reject) => {
    request.get({
      url: `http://127.0.0.1:${PORT}/json-response`,
    }, (err, res, body) => {
      try {
        assert.equal(res.statusCode, 200, 'res.statusCode should be 200')
        assert.equal(typeof res.body, 'object', 'res.body should be parsed object')
        assert.equal(res.body.result.response.id, 'u123', 'res.body accessible')
        resolve()
      } catch (e) { reject(e) }
    })
  })
})

// ---------------------------------------------------------
// P2: request.post({url, form}) — fire-and-forget (no callback)
//     custom-keycloak logout, keycloakHelper
// ---------------------------------------------------------
console.log('\nP2: POST form — fire-and-forget')

await test('post with form and no callback does not throw', async () => {
  // Should not throw, just fire and forget
  const result = request.post({
    url: `http://127.0.0.1:${PORT}/form-echo`,
    form: { client_id: 'portal', refresh_token: 'abc123' },
  })
  // Wait for the promise to settle
  await result
})

// ---------------------------------------------------------
// P3: request.post({url, form}, callback)
//     keycloak-user-creation: body is STRING, caller does JSON.parse(body)
// ---------------------------------------------------------
console.log('\nP3: POST form with callback — body as string')

await test('form data is url-encoded and body is string', () => {
  return new Promise((resolve, reject) => {
    request.post({
      url: `http://127.0.0.1:${PORT}/form-echo`,
      form: { grant_type: 'password', username: 'test@gov.in' },
    }, (err, res, body) => {
      try {
        assert.equal(err, null)
        assert.equal(typeof body, 'string', 'body should be string')
        const parsed = JSON.parse(body)
        assert.equal(parsed.contentType, 'application/x-www-form-urlencoded')
        assert.ok(parsed.received.includes('grant_type=password'), 'form data url-encoded')
        assert.ok(parsed.received.includes('username='), 'username present')
        resolve()
      } catch (e) { reject(e) }
    })
  })
})

// ---------------------------------------------------------
// P4: request.post(url, {json: obj, headers}, callback)
//     details.ts: body is OBJECT (json mode), caller does body.user
// ---------------------------------------------------------
console.log('\nP4: POST with json option — body as object')

await test('json option sends JSON body and returns parsed object', () => {
  return new Promise((resolve, reject) => {
    request.post(`http://127.0.0.1:${PORT}/json-body`, {
      json: { department_name: 'IT', token: 'xyz' },
      headers: { 'X-Custom': 'value' },
    }, (err, res, body) => {
      try {
        assert.equal(err, null)
        assert.equal(typeof body, 'object', 'body should be object in json mode')
        assert.equal(body.user.email, 'test@test.com', 'body.user accessible')
        assert.deepStrictEqual(body.echo, { department_name: 'IT', token: 'xyz' })
        resolve()
      } catch (e) { reject(e) }
    })
  })
})

// ---------------------------------------------------------
// P5: request.post(url, opts).pipe(writable)
//     content.ts: streams response to express res
// ---------------------------------------------------------
console.log('\nP5: POST with .pipe() — streaming')

await test('pipe streams response data to writable', () => {
  return new Promise((resolve, reject) => {
    const chunks = []
    const writable = new Writable({
      write(chunk, encoding, cb) {
        chunks.push(chunk.toString())
        cb()
      },
      final(cb) {
        try {
          const data = chunks.join('')
          assert.equal(data, 'chunk1chunk2chunk3', 'all chunks received')
          resolve()
        } catch (e) { reject(e) }
        cb()
      }
    })

    request.post(`http://127.0.0.1:${PORT}/stream`, {
      json: { test: true },
    }).pipe(writable)
  })
})

// ---------------------------------------------------------
// Error handling
// ---------------------------------------------------------
console.log('\nError handling')

await test('callback receives error for connection refused', () => {
  return new Promise((resolve, reject) => {
    request.get({
      url: 'http://127.0.0.1:19999/nonexistent',
    }, (err, res, body) => {
      try {
        assert.notEqual(err, null, 'err should not be null')
        assert.equal(res, null, 'res should be null on error')
        resolve()
      } catch (e) { reject(e) }
    })
  })
})

// ---------------------------------------------------------
// Summary
// ---------------------------------------------------------
console.log(`\n${'─'.repeat(50)}`)
console.log(`${passed} passed, ${failed} failed`)

server.close()

if (failed > 0) {
  console.log('❌ FAIL')
  process.exit(1)
} else {
  console.log('✅ ALL PASS')
  process.exit(0)
}
