import { transformSync } from '@babel/core'
import syntaxJsx from '@babel/plugin-syntax-jsx'
import { describe, expect, it } from 'vitest'
import { createBabelPlugin } from './babel-plugin.js'
import { ManifestCollector } from './collector.js'

function transform(code: string, filename = '/repo/src/PaymentsDash.jsx') {
  const collector = new ManifestCollector({ repo: 'roughcompass/management-console', commit: 'a41c9ef', buildId: 'build-a' })
  const result = transformSync(code, {
    filename,
    cwd: '/repo',
    root: '/repo',
    configFile: false,
    babelrc: false,
    plugins: [syntaxJsx, createBabelPlugin({ collector, root: '/repo' })],
  })
  return { code: result?.code ?? '', manifest: collector.toJSON(), collector }
}

const SOURCE = `
export function StatusBadge({ status }) {
  return <span className="badge">{status}</span>
}

export const PositionsTable = ({ rows }) => {
  const renderRow = (row) => <tr key={row.id}><td>{row.account}</td></tr>
  return <table><tbody>{rows.map(renderRow)}</tbody></table>
}

export function PaymentsDash({ rows }) {
  return (
    <section>
      <StatusBadge status="settled" />
      <PositionsTable rows={rows} />
    </section>
  )
}
`

describe('provenance babel plugin', () => {
  it('marks host elements and leaves component elements alone', () => {
    const { code } = transform(SOURCE)
    expect(code).toContain('<span className="badge" data-prov=')
    expect(code).toContain('<section data-prov=')
    // A prop on a component is not a DOM attribute, so instrumenting it would
    // put an anchor on something that never reaches the DOM.
    expect(code).not.toMatch(/<StatusBadge[^>]*data-prov/)
    expect(code).not.toMatch(/<PositionsTable[^>]*data-prov/)
  })

  it('records one manifest entry per marked element, keyed by the emitted token', () => {
    const { code, manifest } = transform(SOURCE)
    const tokens = [...code.matchAll(/data-prov="([^"]+)"/g)].map((m) => m[1]!)
    expect(tokens.length).toBe(Object.keys(manifest.nodes).length)
    for (const token of tokens) expect(manifest.nodes[token]).toBeDefined()
  })

  it('attributes each element to the component a reviewer would name', () => {
    const { manifest } = transform(SOURCE)
    const byElement = Object.fromEntries(
      Object.values(manifest.nodes).map((node) => [node.element, node.component]),
    )
    expect(byElement.span).toBe('StatusBadge')
    expect(byElement.table).toBe('PositionsTable')
    // Declared in a helper, but it belongs to the component that owns the helper.
    expect(byElement.tr).toBe('PositionsTable')
    expect(byElement.section).toBe('PaymentsDash')
  })

  it('records repo-relative paths and 1-based positions', () => {
    const { manifest } = transform(SOURCE)
    expect(Object.values(manifest.modules)).toEqual([{ file: 'src/PaymentsDash.jsx' }])
    const span = Object.values(manifest.nodes).find((node) => node.element === 'span')!
    expect(span.line).toBe(3)
    expect(span.column).toBeGreaterThan(0)
    expect(manifest.repo).toBe('roughcompass/management-console')
    expect(manifest.commit).toBe('a41c9ef')
  })

  it('never instruments dependencies', () => {
    const { code, manifest } = transform(SOURCE, '/repo/node_modules/@vendor/grid/index.jsx')
    expect(code).not.toContain('data-prov')
    expect(Object.keys(manifest.nodes)).toHaveLength(0)
  })

  it('leaves an already-marked element untouched', () => {
    const { code } = transform('export const A = () => <div data-prov="kept:1:1" />')
    expect([...code.matchAll(/data-prov=/g)]).toHaveLength(1)
    expect(code).toContain('kept:1:1')
  })

  it('names an element outside any component rather than guessing', () => {
    const { manifest } = transform('export const tree = <div />')
    expect(Object.values(manifest.nodes)[0]!.component).toBe('Anonymous')
  })
})

describe('manifest collector', () => {
  it('gives the same file the same module id every build', () => {
    const a = new ManifestCollector({ repo: 'r', commit: '1' })
    const b = new ManifestCollector({ repo: 'r', commit: '2' })
    expect(a.moduleId('src/App.tsx')).toBe(b.moduleId('src/App.tsx'))
    expect(a.moduleId('src/App.tsx')).not.toBe(a.moduleId('src/Other.tsx'))
  })

  it('forgets a module so a hot update cannot leave stale nodes behind', () => {
    const collector = new ManifestCollector({ repo: 'r', commit: '1' })
    collector.record({ file: 'src/A.tsx', component: 'A', element: 'div', line: 1, column: 1 })
    collector.record({ file: 'src/B.tsx', component: 'B', element: 'span', line: 2, column: 3 })
    expect(collector.size).toBe(2)

    collector.forget('src/A.tsx')
    expect(collector.size).toBe(1)
    expect(Object.values(collector.toJSON().modules)).toEqual([{ file: 'src/B.tsx' }])
  })
})
