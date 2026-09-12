// @vitest-environment node
import { parse } from '@babel/parser'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { prepareProject } from '../src/compiler/project.js'
import type { ProvenanceConfig } from '../src/core/types.js'
import { EDITS } from './golden/edits.js'
import type { EditKind } from './golden/edits.js'
import { GOLDEN_CONFIG, goldenFiles } from './golden/generate.js'
import type { GoldenFile } from './golden/generate.js'
import { writeReport } from './report.js'

const traverse = ((_traverse as unknown as { default?: typeof _traverse }).default ??
  _traverse) as typeof _traverse

/**
 * Ground truth, read from the fixture's own `data-truth` markers in the same
 * traversal order the analyser uses. Nothing in the instrumenter reads these.
 */
function truthMarkers(code: string): Array<string | undefined> {
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  const markers: Array<string | undefined> = []
  traverse(ast, {
    JSXElement: {
      enter(path) {
        const opening = path.node.openingElement
        if (!t.isJSXIdentifier(opening.name) && !t.isJSXMemberExpression(opening.name)) return
        if (!opening.loc) return
        let marker: string | undefined
        for (const attribute of opening.attributes) {
          if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) continue
          if (attribute.name.name !== 'data-truth') continue
          if (t.isStringLiteral(attribute.value)) marker = attribute.value.value
        }
        markers.push(marker)
      },
    },
  })
  return markers
}

async function materialize(root: string, files: GoldenFile[]): Promise<void> {
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'golden' }), 'utf8')
  for (const file of files) {
    await mkdir(dirname(join(root, file.path)), { recursive: true })
    await writeFile(join(root, file.path), file.code, 'utf8')
  }
}

async function assignMarkers(
  root: string,
  files: GoldenFile[],
  registryJson?: string,
): Promise<{ byMarker: Map<string, string>; registryJson: string; total: number }> {
  await materialize(root, files)
  if (registryJson) {
    await mkdir(join(root, '.ui-provenance'), { recursive: true })
    await writeFile(join(root, '.ui-provenance/registry.json'), registryJson, 'utf8')
  }

  const project = await prepareProject({
    root,
    config: GOLDEN_CONFIG as ProvenanceConfig,
    mode: 'sync',
  })

  const byMarker = new Map<string, string>()
  let total = 0
  for (const file of files) {
    const markers = truthMarkers(file.code)
    const ids = project.idsFor(file.path)
    markers.forEach((marker, index) => {
      total += 1
      const sourceId = ids.get(index)
      if (marker && sourceId) byMarker.set(marker, sourceId)
    })
  }

  const { readFile } = await import('node:fs/promises')
  return {
    byMarker,
    registryJson: await readFile(join(root, '.ui-provenance/registry.json'), 'utf8'),
    total,
  }
}

interface EditOutcome {
  edit: string
  kind: EditKind
  eligible: number
  retained: number
  falseReattachments: number
  retentionRate: number
}

describe('golden stability evaluation', () => {
  it('preserves identity across a deterministic edit suite', async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'uip-golden-'))
    const baselineRoot = join(workspace, 'baseline')
    await mkdir(baselineRoot, { recursive: true })

    const files = goldenFiles()
    const baseline = await assignMarkers(baselineRoot, files)

    // The corpus itself must be big enough for the rates to mean anything.
    expect(baseline.byMarker.size).toBeGreaterThanOrEqual(100)

    const outcomes: EditOutcome[] = []

    for (const [index, edit] of EDITS.entries()) {
      const root = join(workspace, `edit-${index}`)
      await mkdir(root, { recursive: true })
      const edited = edit.apply(files.map((file) => ({ ...file })))
      const after = await assignMarkers(root, edited, baseline.registryJson)

      const removed = new Set(edit.removes ?? [])
      let eligible = 0
      let retained = 0
      for (const [marker, sourceId] of baseline.byMarker) {
        if (removed.has(marker)) continue
        if (!after.byMarker.has(marker)) continue
        eligible += 1
        if (after.byMarker.get(marker) === sourceId) retained += 1
      }

      // A false reattachment is an id that survived onto a different element.
      const beforeById = new Map([...baseline.byMarker].map(([marker, id]) => [id, marker]))
      let falseReattachments = 0
      for (const [marker, sourceId] of after.byMarker) {
        const previous = beforeById.get(sourceId)
        if (previous && previous !== marker) falseReattachments += 1
      }

      outcomes.push({
        edit: edit.name,
        kind: edit.kind,
        eligible,
        retained,
        falseReattachments,
        retentionRate: eligible === 0 ? 1 : retained / eligible,
      })
    }

    const rateFor = (kinds: EditKind[]): number => {
      const scoped = outcomes.filter((outcome) => kinds.includes(outcome.kind))
      const eligible = scoped.reduce((sum, outcome) => sum + outcome.eligible, 0)
      const retained = scoped.reduce((sum, outcome) => sum + outcome.retained, 0)
      return eligible === 0 ? 1 : retained / eligible
    }

    const formattingRate = rateFor(['formatting'])
    const ordinaryRate = rateFor(['formatting', 'ordinary'])
    const falseReattachments = outcomes.reduce((sum, o) => sum + o.falseReattachments, 0)

    await writeReport('stability-report.json', {
      corpusSize: baseline.byMarker.size,
      edits: outcomes,
      formattingRetentionRate: formattingRate,
      ordinaryRetentionRate: ordinaryRate,
      falseReattachmentRate: falseReattachments,
      criteria: {
        formattingRetention: { required: 1, actual: formattingRate },
        ordinaryRetention: { required: 0.98, actual: ordinaryRate },
        falseReattachments: { required: 0, actual: falseReattachments },
      },
    })

    await rm(workspace, { recursive: true, force: true })

    // A visible orphan is safer than feedback on the wrong control, so this
    // one is checked first and has no tolerance.
    expect(falseReattachments).toBe(0)
    expect(formattingRate).toBe(1)
    expect(ordinaryRate).toBeGreaterThanOrEqual(0.98)
  }, 120_000)
})
