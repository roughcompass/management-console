#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { readdir, readFile, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const ROOT = process.cwd()
const APPS = ['apps/payments-mfe', 'apps/limits-mfe', 'apps/shell']
const FORBIDDEN = ['data-de-provenance-', 'data-de-instance-key', 'ui-provenance-manifest']

/**
 * Production exclusion, proven by looking at the artifact rather than by
 * trusting the flag. A zero-byte claim is only worth what the inspection says.
 */
async function filesUnder(directory) {
  const found = []
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.isDirectory()) await walk(path)
      else found.push(path)
    }
  }
  await walk(directory)
  return found
}

async function buildWithFlag(app) {
  // A production build that is asked for instrumentation must refuse, not
  // quietly comply. This is the half a stray environment variable exercises.
  try {
    await run('pnpm', ['--filter', `./${app}`, 'build'], {
      cwd: ROOT,
      env: { ...process.env, DE_UI_PROVENANCE_ENABLED: 'true' },
      maxBuffer: 32 * 1024 * 1024,
    })
    return { guarded: false, message: 'the build succeeded with instrumentation requested' }
  } catch (error) {
    const output = `${error.stdout ?? ''}${error.stderr ?? ''}`
    return { guarded: output.includes('UIP_PRODUCTION_GUARD'), message: output.slice(0, 200) }
  }
}

async function inspect(app) {
  const dist = join(ROOT, app, 'dist')
  const guard = await buildWithFlag(app)
  await rm(dist, { recursive: true, force: true })

  // And an ordinary production build must emit nothing at all.
  await run('pnpm', ['--filter', `./${app}`, 'build'], {
    cwd: ROOT,
    env: { ...process.env, DE_UI_PROVENANCE_ENABLED: '' },
    maxBuffer: 32 * 1024 * 1024,
  })

  const files = await filesUnder(dist)
  const offenders = []
  for (const file of files) {
    const contents = await readFile(file, 'utf8').catch(() => '')
    for (const needle of FORBIDDEN) {
      if (contents.includes(needle)) offenders.push({ file: file.replace(`${ROOT}/`, ''), needle })
    }
  }

  const manifestPresent = files.some((file) => file.endsWith('ui-provenance-manifest.json'))
  return { app, files: files.length, offenders, manifestPresent, guard }
}

const results = []
for (const app of APPS) results.push(await inspect(app))

const failed = results.filter(
  (result) => result.offenders.length > 0 || result.manifestPresent || !result.guard.guarded,
)
const report = {
  generatedAt: new Date().toISOString(),
  forbidden: FORBIDDEN,
  results,
  passed: failed.length === 0,
}

await mkdir(join(ROOT, 'ui-provenance/validation'), { recursive: true })
await writeFile(
  join(ROOT, 'ui-provenance/validation/production-report.json'),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8',
)

for (const result of results) {
  const clean = result.offenders.length === 0 && !result.manifestPresent
  console.log(
    `${result.app}: ${result.files} artifact files, ${clean ? 'no provenance output' : 'FAILED'}` +
      `, guard ${result.guard.guarded ? 'refused the instrumented production build' : 'DID NOT FIRE'}`,
  )
  for (const offender of result.offenders) console.log(`  ${offender.needle} in ${offender.file}`)
}

process.exit(failed.length === 0 ? 0 : 1)
