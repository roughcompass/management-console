// @vitest-environment node
import { transformSync } from '@babel/core'
// Resolved here rather than by name: babel resolves plugin names against its
// cwd, which is the throwaway project root in this test.
import syntaxJsx from '@babel/plugin-syntax-jsx'
import syntaxTypescript from '@babel/plugin-syntax-typescript'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createInjectorBabelPlugin } from '../src/compiler/babel.js'
import { prepareProject } from '../src/compiler/project.js'
import type { ProvenanceConfig } from '../src/core/types.js'
import uiProvenanceLoader from '../src/webpack/loader.js'
import { clearProject, setProject } from '../src/webpack/state.js'

const CONFIG: ProvenanceConfig = {
  applicationId: 'equivalence-app',
  repository: 'test/equivalence',
  include: ['src/**/*.{jsx,tsx}'],
  exclude: [],
  registry: '.ui-provenance/registry.json',
  saltPackages: ['@salt-ds/core'],
  ambiguousMatchThreshold: 0.9,
  tombstoneRetentionDays: 90,
  productionDisabled: true,
  federation: { name: 'equivalence', role: 'remote', exposes: ['./Widget'] },
}

const SOURCE = `import { Button } from '@salt-ds/core'

export function Widget({ rows }: { rows: Array<{ id: string; label: string }> }) {
  return (
    <section className="widget">
      <h2>Positions</h2>
      <ul>
        {rows.map((row) => (
          <li key={row.id} data-de-instance-key={row.id}>
            <span className="label">{row.label}</span>
          </li>
        ))}
      </ul>
      <Button appearance="solid">Refresh</Button>
    </section>
  )
}
`

async function project(root: string) {
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'equivalence' }), 'utf8')
  await mkdir(join(root, 'src'), { recursive: true })
  await writeFile(join(root, 'src/Widget.tsx'), SOURCE, 'utf8')
  return prepareProject({ root, config: CONFIG, mode: 'sync' })
}

function idsIn(code: string): string[] {
  return [...code.matchAll(/data-de-provenance-id="(prv_[0-9A-HJKMNP-TV-Z]{26})"/g)].map(
    (match) => match[1]!,
  )
}

describe('bundler adapters', () => {
  it('produce the same identities and the same manifest for the same source', async () => {
    const root = await mkdtemp(join(tmpdir(), 'uip-equiv-'))
    const prepared = await project(root)

    // The Webpack path: the shared transform, through the loader.
    setProject(root, prepared)
    const webpackCode = uiProvenanceLoader.call(
      { rootContext: root, resourcePath: join(root, 'src/Widget.tsx') },
      SOURCE,
    )
    const webpackManifest = prepared.manifest()

    // The Vite path: the same identities, injected by the host's JSX pass.
    const babel = transformSync(SOURCE, {
      filename: join(root, 'src/Widget.tsx'),
      cwd: root,
      root,
      configFile: false,
      babelrc: false,
      plugins: [
        syntaxJsx,
        [syntaxTypescript, { isTSX: true }],
        createInjectorBabelPlugin(
          {
            elementsFor: (file) => prepared.elementsFor(file),
            idsFor: (file) => prepared.idsFor(file),
            get catalog() {
              return prepared.catalog
            },
          },
          root,
        ),
      ],
    })
    const viteCode = babel?.code ?? ''
    const viteManifest = prepared.manifest()

    const webpackIds = idsIn(webpackCode)
    const viteIds = idsIn(viteCode)

    expect(webpackIds.length).toBeGreaterThan(0)
    // Same elements, in the same order, carrying the same identities.
    expect(viteIds).toEqual(webpackIds)
    // Every injected id is one the registry issued.
    for (const id of webpackIds) expect(webpackManifest.sources[id]).toBeDefined()
    expect(viteManifest.schemaVersion).toBe(webpackManifest.schemaVersion)
    expect(Object.keys(viteManifest.sources)).toEqual(Object.keys(webpackManifest.sources))

    clearProject(root)
    await rm(root, { recursive: true, force: true })
  }, 60_000)

  it('leaves a file outside the project root untouched', async () => {
    const root = await mkdtemp(join(tmpdir(), 'uip-equiv-'))
    const prepared = await project(root)
    setProject(root, prepared)

    const untouched = uiProvenanceLoader.call(
      { rootContext: root, resourcePath: '/elsewhere/Other.tsx' },
      SOURCE,
    )
    expect(untouched).toBe(SOURCE)

    clearProject(root)
    await rm(root, { recursive: true, force: true })
  }, 60_000)
})
