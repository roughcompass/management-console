import { expect, test } from '@playwright/test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

interface ProbeResult {
  component: string
  package: string
  carriers: number
  carrierTags: string[]
  renderedRoots: number
  error?: string
}

type Compatibility =
  | 'forwards-data-attributes'
  | 'requires-slot-target'
  | 'composite-no-single-root'
  | 'unsupported'

/** The set the specification names. The probe covers more. */
const REQUIRED = [
  'Button',
  'Input',
  'Checkbox',
  'Dropdown',
  'Card',
  'Link',
  'Dialog',
  'Table',
  'SaltProvider',
]

/** Where each MFE's compiler reads its catalog from. */
const CATALOG_TARGETS = [
  '../../apps/payments-mfe/.ui-provenance/salt-catalog.json',
  '../../apps/limits-mfe/.ui-provenance/salt-catalog.json',
  '../../apps/shell/.ui-provenance/salt-catalog.json',
  '../../ui-provenance/validation/salt-catalog.json',
]

function classify(result: ProbeResult): { compatibility: Compatibility; evidence: string } {
  if (result.error) {
    return { compatibility: 'unsupported', evidence: `render failed: ${result.error}` }
  }
  if (result.carriers === 1) {
    return {
      compatibility: 'forwards-data-attributes',
      evidence: `attribute reached one <${result.carrierTags[0]}>`,
    }
  }
  if (result.carriers > 1) {
    return {
      compatibility: 'composite-no-single-root',
      evidence: `attribute reached ${result.carriers} elements (${result.carrierTags.join(', ')})`,
    }
  }
  if (result.renderedRoots > 1) {
    return {
      compatibility: 'composite-no-single-root',
      evidence: `rendered ${result.renderedRoots} roots and forwarded nothing`,
    }
  }
  return {
    compatibility: 'unsupported',
    evidence: 'attribute did not reach any DOM node',
  }
}

test('generates the Salt compatibility catalog from the rendered DOM', async ({ page }) => {
  await page.goto('/salt-compat.html')
  await page.waitForSelector('[data-probe-status="ready"]')

  const results = await page.evaluate(
    () => (window as unknown as { __SALT_COMPAT__?: ProbeResult[] }).__SALT_COMPAT__ ?? [],
  )
  const probed = results.map((result) => result.component)
  for (const component of REQUIRED) expect(probed).toContain(component)

  const saltVersion = JSON.parse(
    await readFile(
      join(process.cwd(), 'node_modules/@salt-ds/core/package.json'),
      'utf8',
    ),
  ).version as string

  const catalog = {
    schemaVersion: '1.0' as const,
    generatedAt: new Date().toISOString(),
    entries: results.map((result) => {
      const { compatibility, evidence } = classify(result)
      return {
        component: result.component,
        package: result.package,
        version: saltVersion,
        compatibility,
        evidence,
        testedAt: new Date().toISOString(),
      }
    }),
  }

  for (const target of CATALOG_TARGETS) {
    const path = join(process.cwd(), target)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  }

  // What a component classifies as is evidence, not a pass criterion. What is
  // a pass criterion: an application may not render a Salt component the suite
  // has never tested, or most of its page resolves to an ancestor.
  for (const entry of catalog.entries) expect(entry.evidence.length).toBeGreaterThan(0)

  const { glob } = await import('node:fs/promises')
  const used = new Set<string>()
  for await (const registryPath of glob(join(process.cwd(), '../*/.ui-provenance/registry.json'))) {
    const registry = JSON.parse(await readFile(registryPath, 'utf8')) as {
      entries: Array<{ status: string; elementKind: string; elementType: string }>
    }
    for (const entry of registry.entries) {
      if (entry.status === 'active' && entry.elementKind === 'salt') used.add(entry.elementType)
    }
  }
  const catalogued = new Set(catalog.entries.map((entry) => entry.component))
  const untested = [...used].filter((component) => !catalogued.has(component)).sort()
  expect(untested, 'Salt components rendered by the fixtures but never probed').toEqual([])
  // eslint-disable-next-line no-console
  console.log(
    catalog.entries
      .map((entry) => `  ${entry.component.padEnd(14)} ${entry.compatibility}  (${entry.evidence})`)
      .join('\n'),
  )
})
