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
  expect(results.map((result) => result.component).sort()).toEqual([...REQUIRED].sort())

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

  // Every required component must be classified; what it classifies as is
  // evidence, not a pass criterion.
  for (const entry of catalog.entries) {
    expect(REQUIRED).toContain(entry.component)
    expect(entry.evidence.length).toBeGreaterThan(0)
  }
  // eslint-disable-next-line no-console
  console.log(
    catalog.entries
      .map((entry) => `  ${entry.component.padEnd(14)} ${entry.compatibility}  (${entry.evidence})`)
      .join('\n'),
  )
})
