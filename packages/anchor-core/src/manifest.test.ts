import { describe, expect, it } from 'vitest'
import { createResolutionContext } from './index-dom.js'
import { mergeProvenanceManifests } from './manifest.js'
import type { ProvenanceManifest } from './types.js'
import { lockV1, mount } from './__fixtures__/dom.js'

function manifestFor(scope: string, moduleId: string, commit: string): ProvenanceManifest {
  return {
    version: 1,
    scopes: { [scope]: { repo: `roughcompass/${scope}`, commit, buildId: `${scope}-build` } },
    modules: { [moduleId]: { file: 'src/App.tsx', scope } },
    nodes: {
      [`${moduleId}:4:3`]: {
        module: moduleId,
        component: 'Root',
        element: 'span',
        line: 4,
        column: 3,
      },
    },
  }
}

describe('federated manifests', () => {
  it('merges one manifest per remote into the shell view', () => {
    const merged = mergeProvenanceManifests(
      manifestFor('payments-dash', 'aaa', 'a41c9ef'),
      manifestFor('limits-panel', 'bbb', '7d20b13'),
      undefined,
    )
    expect(Object.keys(merged.scopes)).toEqual(['payments-dash', 'limits-panel'])
    // Two remotes both shipping src/App.tsx stay distinct: module ids are
    // hashed with their scope at build time.
    expect(Object.keys(merged.modules)).toEqual(['aaa', 'bbb'])
    expect(Object.keys(merged.nodes)).toHaveLength(2)
  })

  it('attributes a node to the remote that built it, not to the shell', () => {
    const merged = mergeProvenanceManifests(
      manifestFor('payments-dash', 'aaa', 'a41c9ef'),
      manifestFor('limits-panel', 'bbb', '7d20b13'),
    )
    const root = mount(`
      <div data-frame="cib-frame">
        <main data-zone="main">
          <section data-mfe="payments-dash" data-mfe-version="2.4.1">
            <span data-prov="aaa:4:3">settled</span>
          </section>
          <section data-mfe="limits-panel" data-mfe-version="1.2.0">
            <span data-prov="bbb:4:3">62%</span>
          </section>
        </main>
      </div>`)

    const ctx = createResolutionContext({ root, manifest: merged, lock: lockV1 })
    const payments = ctx.nodeFor(root.querySelector('[data-prov="aaa:4:3"]')!)
    const limits = ctx.nodeFor(root.querySelector('[data-prov="bbb:4:3"]')!)

    expect(payments?.provenance).toMatchObject({ scope: 'payments-dash', commit: 'a41c9ef' })
    expect(limits?.provenance).toMatchObject({ scope: 'limits-panel', commit: '7d20b13' })
  })
})
