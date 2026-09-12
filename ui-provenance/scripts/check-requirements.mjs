#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = process.cwd()
const MANIFEST = 'ui-provenance/validation/requirements.json'

/** Every identifier the specification defines. */
const FUNCTIONAL = Array.from({ length: 22 }, (_value, index) =>
  `UIP-${String(index + 1).padStart(3, '0')}`,
)
const NON_FUNCTIONAL = Array.from({ length: 7 }, (_value, index) =>
  `UIP-NFR-${String(index + 1).padStart(3, '0')}`,
)
const EXPECTED = [...FUNCTIONAL, ...NON_FUNCTIONAL]

const exists = async (path) => {
  try {
    await access(join(ROOT, path))
    return true
  } catch {
    return false
  }
}

const manifest = JSON.parse(await readFile(join(ROOT, MANIFEST), 'utf8'))
const problems = []
const seen = new Set()

for (const requirement of manifest.requirements) {
  if (seen.has(requirement.id)) problems.push(`duplicate requirement ${requirement.id}`)
  seen.add(requirement.id)
  if (!EXPECTED.includes(requirement.id)) problems.push(`unknown requirement ${requirement.id}`)

  for (const path of [...requirement.implementation, ...requirement.tests]) {
    if (!(await exists(path))) problems.push(`${requirement.id}: missing file ${path}`)
  }

  // A requirement cannot claim to be verified without evidence that exists.
  if (requirement.status === 'verified') {
    const hasTests = requirement.tests.length > 0
    const hasMeasurement = Boolean(requirement.measurement)
    if (!hasTests && !hasMeasurement && !requirement.note) {
      problems.push(`${requirement.id}: verified with neither a test nor a measurement`)
    }
  }

  if (requirement.measurement) {
    if (!(await exists(requirement.measurement))) {
      problems.push(`${requirement.id}: measurement ${requirement.measurement} has not been produced`)
      continue
    }
    const report = JSON.parse(await readFile(join(ROOT, requirement.measurement), 'utf8'))
    if (!report.generatedAt || Number.isNaN(Date.parse(report.generatedAt))) {
      problems.push(`${requirement.id}: measurement ${requirement.measurement} has no usable timestamp`)
    }
    if (report.passed === false) {
      problems.push(`${requirement.id}: measurement ${requirement.measurement} reports a failure`)
    }
  }
}

for (const id of EXPECTED) {
  if (!seen.has(id)) problems.push(`missing requirement ${id}`)
}

if (problems.length > 0) {
  console.error(`requirement traceability failed:\n  ${problems.join('\n  ')}`)
  process.exit(1)
}

const measured = manifest.requirements.filter((requirement) => requirement.measurement).length
console.log(
  `traceability ok: ${manifest.requirements.length} requirements, ` +
    `${measured} backed by a machine-readable measurement`,
)
