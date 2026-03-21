/**
 * Single test runner — discovers and runs all test-*.mjs files.
 *
 * Run: npx tsx tests/run-all.mjs
 */

import { readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const tests = readdirSync(dir)
  .filter(f => f.startsWith('test-') && f.endsWith('.mjs'))
  .sort()

let passed = 0
let failed = 0
const results = []

for (const file of tests) {
  const path = join(dir, file)
  const label = file.replace('test-', '').replace('.mjs', '')
  process.stdout.write(`\n▶ ${label}\n`)

  try {
    execSync(`npx tsx "${path}"`, { stdio: 'inherit', timeout: 30000 })
    passed++
    results.push({ label, status: '✅' })
  } catch {
    failed++
    results.push({ label, status: '❌' })
  }
}

console.log(`\n${'═'.repeat(50)}`)
console.log('  RESULTS')
console.log('═'.repeat(50))
results.forEach(r => console.log(`  ${r.status} ${r.label}`))
console.log(`\n  ${passed} passed, ${failed} failed`)
console.log('═'.repeat(50))

process.exit(failed > 0 ? 1 : 0)
