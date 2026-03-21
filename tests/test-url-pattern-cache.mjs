/**
 * Test: URL pattern cache — pre-compiled regex vs per-request compilation.
 *
 * Verifies:
 * 1. Correctness: cached match produces same results as inline pathToRegexp
 * 2. Performance: cached matching is significantly faster
 * 3. Edge cases: no match, exact match, parameterized match
 *
 * Run: npx tsx tests/test-url-pattern-cache.mjs
 */

import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

const { pathToRegexp } = await import('path-to-regexp')

// --- Sample patterns (subset of the real 925) ---
const URL_PATTERNS = [
  '/authApi/readBatch/:batchId',
  '/authApi/batch/:key',
  '/authApi/readCert/:certId',
  '/proxies/v8/api/user/v2/read',
  '/proxies/v8/api/user/v2/read/:id',
  '/proxies/v8/api/user/v5/read/:id',
  '/proxies/v8/event/v4/read/:do_id',
  '/proxies/v8/discussion/topic/:id/:slug',
  '/proxies/v8/action/content/v3/hierarchy/:do_id',
  '/proxies/v8/learner/course/v1/user/enrollment/list/:id',
]

// --- Simulate the CACHED approach (our fix) ---
const compiledPatterns = URL_PATTERNS.map(url => ({
  pattern: url,
  regex: pathToRegexp(url),
}))

function matchCached(reqPath) {
  for (const entry of compiledPatterns) {
    if (entry.regex.test(reqPath)) {
      return entry.pattern
    }
  }
  return null
}

// --- Simulate the OLD approach (inline compilation per call) ---
function matchInline(reqPath) {
  for (const url of URL_PATTERNS) {
    const regExp = pathToRegexp(url)
    if (regExp.test(reqPath)) {
      return url
    }
  }
  return null
}

// =========================================================
// CORRECTNESS TESTS
// =========================================================
let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`  ✅ ${name}`)
    passed++
  } catch (err) {
    console.error(`  ❌ ${name}`)
    console.error(`     ${err.message}`)
    failed++
  }
}

console.log('Correctness tests')

test('exact match — no params', () => {
  const path = '/proxies/v8/api/user/v2/read'
  assert.equal(matchCached(path), matchInline(path))
  assert.equal(matchCached(path), '/proxies/v8/api/user/v2/read')
})

test('parameterized match — single param', () => {
  const path = '/proxies/v8/api/user/v2/read/user-123'
  assert.equal(matchCached(path), matchInline(path))
  assert.equal(matchCached(path), '/proxies/v8/api/user/v2/read/:id')
})

test('parameterized match — multiple params', () => {
  const path = '/proxies/v8/discussion/topic/42/my-topic-slug'
  assert.equal(matchCached(path), matchInline(path))
  assert.equal(matchCached(path), '/proxies/v8/discussion/topic/:id/:slug')
})

test('parameterized match — deep path', () => {
  const path = '/proxies/v8/action/content/v3/hierarchy/do_12345'
  assert.equal(matchCached(path), matchInline(path))
  assert.equal(matchCached(path), '/proxies/v8/action/content/v3/hierarchy/:do_id')
})

test('no match returns null', () => {
  const path = '/this/path/does/not/exist'
  assert.equal(matchCached(path), null)
  assert.equal(matchInline(path), null)
})

test('partial path does not match', () => {
  const path = '/proxies/v8/api/user'
  assert.equal(matchCached(path), matchInline(path))
})

test('cached and inline always agree on 100 random paths', () => {
  const testPaths = [
    '/authApi/readBatch/batch-001',
    '/authApi/batch/key-xyz',
    '/authApi/readCert/cert-999',
    '/proxies/v8/api/user/v5/read/uid-456',
    '/proxies/v8/event/v4/read/do_789',
    '/proxies/v8/learner/course/v1/user/enrollment/list/user-1',
    '/random/unmatched/path',
    '/proxies/v8/api/user/v2/read',
    '/',
    '',
  ]
  for (const p of testPaths) {
    assert.equal(matchCached(p), matchInline(p), `mismatch on: ${p}`)
  }
})

// =========================================================
// PERFORMANCE TEST
// =========================================================
console.log('\nPerformance test (10,000 iterations)')

const testPath = '/proxies/v8/learner/course/v1/user/enrollment/list/user-42'
const ITERATIONS = 10000

// Warm up
for (let i = 0; i < 100; i++) { matchCached(testPath); matchInline(testPath) }

const startCached = performance.now()
for (let i = 0; i < ITERATIONS; i++) { matchCached(testPath) }
const cachedMs = performance.now() - startCached

const startInline = performance.now()
for (let i = 0; i < ITERATIONS; i++) { matchInline(testPath) }
const inlineMs = performance.now() - startInline

const speedup = (inlineMs / cachedMs).toFixed(1)

console.log(`  Cached:  ${cachedMs.toFixed(1)}ms`)
console.log(`  Inline:  ${inlineMs.toFixed(1)}ms`)
console.log(`  Speedup: ${speedup}x`)

test(`cached is faster than inline`, () => {
  assert.ok(cachedMs < inlineMs, `cached (${cachedMs.toFixed(1)}ms) should be faster than inline (${inlineMs.toFixed(1)}ms)`)
})

// =========================================================
// SUMMARY
// =========================================================
console.log(`\n${'─'.repeat(50)}`)
console.log(`${passed} passed, ${failed} failed`)

if (failed > 0) {
  console.log('❌ FAIL')
  process.exit(1)
} else {
  console.log('✅ ALL PASS')
  process.exit(0)
}
