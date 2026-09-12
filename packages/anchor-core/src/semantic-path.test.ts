import { describe, expect, it } from 'vitest'
import {
  buildSemanticPath,
  formatSemanticPath,
  matchSemanticPath,
  parseSemanticPath,
} from './semantic-path.js'
import type { ProvenanceManifest } from './types.js'
import { htmlV1, manifestV1, mount } from './__fixtures__/dom.js'

describe('semantic path', () => {
  it('reads the host contract and the build manifest into one path', () => {
    const root = mount(htmlV1())
    const badge = root.querySelector('[data-prov="m1:9:5"]')!
    const path = buildSemanticPath(badge, manifestV1, root)
    expect(formatSemanticPath(path, { includeElement: false })).toBe(
      'Frame[cib-frame]@3.1 > Zone[main] > MFE[payments-dash]@2.4.1 > PositionsTable > StatusBadge',
    )
    expect(formatSemanticPath(path)).toMatch(/> span$/)
  })

  it('collapses consecutive repeats of the same component', () => {
    const root = mount(htmlV1())
    const cell = root.querySelector('[data-prov="m1:22:13"]')!
    const path = buildSemanticPath(cell, manifestV1, root)
    const components = path.segments.filter((s) => s.kind === 'component').map((s) => s.name)
    expect(components).toEqual(['PositionsTable'])
  })

  it('starts at the innermost host boundary, not at the app shell', () => {
    // The preview's own chrome renders the Frame, and the Frame renders the
    // zone. Neither belongs in the address of a node inside an MFE.
    const manifest: ProvenanceManifest = {
      version: 1,
      repo: 'roughcompass/management-console',
      commit: 'a41c9ef',
      buildId: 'build-a',
      modules: { m9: { file: 'src/App.tsx' } },
      nodes: {
        'm9:1:1': { module: 'm9', component: 'App', element: 'div', line: 1, column: 1 },
        'm9:2:2': { module: 'm9', component: 'Frame', element: 'main', line: 2, column: 2 },
        'm9:3:3': { module: 'm9', component: 'PositionsTable', element: 'span', line: 3, column: 3 },
      },
    }
    const root = mount(`
      <div data-prov="m9:1:1">
        <div data-frame="cib-frame" data-frame-version="3.1">
          <main data-zone="main" data-prov="m9:2:2">
            <section data-mfe="payments-dash" data-mfe-version="2.4.1">
              <span data-prov="m9:3:3">settled</span>
            </section>
          </main>
        </div>
      </div>`)
    const path = buildSemanticPath(root.querySelector('[data-prov="m9:3:3"]')!, manifest, root)
    expect(formatSemanticPath(path, { includeElement: false })).toBe(
      'Frame[cib-frame]@3.1 > Zone[main] > MFE[payments-dash]@2.4.1 > PositionsTable',
    )
  })

  it('round-trips through its printed form', () => {
    const text = 'Frame > Zone[main] > MFE[payments-dash]@2.4.1 > PositionsTable > StatusBadge > span'
    expect(formatSemanticPath(parseSemanticPath(text))).toBe(text)
  })

  it('scores an exact path at 1 and an MFE version bump just below it', () => {
    const target = parseSemanticPath('Zone[main] > MFE[payments-dash]@2.4.1 > PositionsTable > span')
    const same = parseSemanticPath('Zone[main] > MFE[payments-dash]@2.4.1 > PositionsTable > span')
    const bumped = parseSemanticPath('Zone[main] > MFE[payments-dash]@2.5.0 > PositionsTable > span')
    expect(matchSemanticPath(target, same)).toBe(1)
    expect(matchSemanticPath(target, bumped)).toBeCloseTo(0.9, 5)
  })

  it('scores a partial tail below a full match and a mismatch at zero', () => {
    const target = parseSemanticPath('Zone[main] > MFE[payments-dash]@2.4.1 > SummaryCard > h3')
    const partial = parseSemanticPath('Zone[side] > MFE[limits-panel]@1.2.0 > SummaryCard > h3')
    const miss = parseSemanticPath('Zone[main] > MFE[payments-dash]@2.4.1 > PositionsTable > td')
    expect(matchSemanticPath(target, partial)).toBeGreaterThan(0)
    expect(matchSemanticPath(target, partial)).toBeLessThan(1)
    expect(matchSemanticPath(target, miss)).toBe(0)
  })
})
