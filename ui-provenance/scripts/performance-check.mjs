#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = process.cwd()
const APP = 'apps/payments-mfe'
const RUNS = 3

/**
 * Preview build-time overhead, measured rather than asserted. Both series run
 * after a warm dependency install and a warm first build, so what is compared
 * is the instrumentation, not the cold cache.
 */
async function timeBuild(script, env) {
  await rm(join(ROOT, APP, 'dist'), { recursive: true, force: true })
  const started = performance.now()
  await run('pnpm', ['--filter', `./${APP}`, script], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    maxBuffer: 32 * 1024 * 1024,
  })
  return performance.now() - started
}

// Warm up: the first build of a session pays for esbuild and dependency scan.
await timeBuild('build', { DE_UI_PROVENANCE_ENABLED: '' })

const plain = []
const instrumented = []
for (let index = 0; index < RUNS; index++) {
  plain.push(await timeBuild('build', { DE_UI_PROVENANCE_ENABLED: '' }))
  instrumented.push(await timeBuild('build:preview', {}))
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]
const plainMs = median(plain)
const previewMs = median(instrumented)
const overhead = (previewMs - plainMs) / plainMs

const report = {
  generatedAt: new Date().toISOString(),
  app: APP,
  runs: RUNS,
  plainBuildMs: Math.round(plainMs),
  previewBuildMs: Math.round(previewMs),
  overheadRatio: Number(overhead.toFixed(4)),
  budget: 0.15,
  passed: overhead <= 0.15,
}

await mkdir(join(ROOT, 'ui-provenance/validation'), { recursive: true })
await writeFile(
  join(ROOT, 'ui-provenance/validation/performance-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
)

console.log(
  `plain ${report.plainBuildMs}ms, preview ${report.previewBuildMs}ms, ` +
    `overhead ${(overhead * 100).toFixed(1)}% (budget 15%) -> ${report.passed ? 'within budget' : 'OVER BUDGET'}`,
)
process.exit(report.passed ? 0 : 1)
