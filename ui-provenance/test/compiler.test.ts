// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseFileElements } from '../src/compiler/ast.js'
import type { ParsedFile } from '../src/compiler/ast.js'
import { emptyRegistry, syncRegistry } from '../src/compiler/registry.js'
import { instrumentSource } from '../src/compiler/transform.js'
import { assertNoProductionInstrumentation } from '../src/compiler/manifest.js'
import { ATTR_PREFIX } from '../src/core/attributes.js'
import { isUipError } from '../src/core/errors.js'
import type { Registry } from '../src/core/types.js'

const SALT = ['@salt-ds/core']

function parse(code: string, file = 'src/Demo.tsx'): ParsedFile {
  return parseFileElements(code, { file, saltPackages: SALT })
}

function sync(registry: Registry, files: ParsedFile[]) {
  return syncRegistry({
    registry,
    files,
    ambiguousMatchThreshold: 0.9,
    tombstoneRetentionDays: 90,
    now: () => '2026-09-12T00:00:00.000Z',
  })
}

function idsByPosition(result: ReturnType<typeof sync>, file: string, count: number) {
  return Array.from({ length: count }, (_value, index) => result.assignments.get(`${file}#${index}`))
}

function instrument(code: string, file = 'src/Demo.tsx') {
  const parsed = parse(code, file)
  const result = sync(emptyRegistry('demo'), [parsed])
  const ids = new Map(
    parsed.elements.map((_element, index) => [
      index,
      result.assignments.get(`${file}#${index}`)!,
    ]),
  )
  return instrumentSource({ code, file, elements: parsed.elements, ids })
}

describe('discovery and identity', () => {
  it('assigns an id to every discovered element', () => {
    const parsed = parse(`
      export function Demo() {
        return (
          <section>
            <button type="submit">Submit</button>
          </section>
        )
      }
    `)
    const result = sync(emptyRegistry('demo'), [parsed])
    expect(parsed.elements).toHaveLength(2)
    expect(result.counts.added).toBe(2)
    expect(result.registry.entries.every((entry) => entry.sourceId.startsWith('prv_'))).toBe(true)
  })

  it('never includes position or formatting in the fingerprint', () => {
    const a = parse(`export const A = () => <button type="submit">Go</button>`)
    const b = parse(`
      // a comment that moves everything down


      export const A = () => (
        <button    type="submit"   >Go</button>
      )
    `)
    expect(b.elements[0]!.fingerprint).toBe(a.elements[0]!.fingerprint)
    expect(b.elements[0]!.line).not.toBe(a.elements[0]!.line)
  })

  it('treats a class name change as no change at all', () => {
    const a = parse(`export const A = () => <div className="card">x</div>`)
    const b = parse(`export const A = () => <div className="ui-card">x</div>`)
    expect(b.elements[0]!.fingerprint).toBe(a.elements[0]!.fingerprint)
  })

  it('classifies host, application and design-system elements', () => {
    const parsed = parse(`
      import { Button } from '@salt-ds/core'
      import { Widget } from './Widget'
      export const A = () => (
        <div>
          <Button>Go</Button>
          <Widget />
        </div>
      )
    `)
    expect(parsed.elements.map((element) => element.elementKind)).toEqual([
      'host',
      'salt',
      'application',
    ])
    expect(parsed.elements[1]!.library).toEqual({ name: '@salt-ds/core', component: 'Button' })
  })
})

describe('registry synchronisation', () => {
  const source = `
    export function Demo() {
      return (
        <section>
          <button type="submit">Submit</button>
          <p>Note</p>
        </section>
      )
    }
  `

  it('preserves ids when an unrelated sibling is added', () => {
    const first = sync(emptyRegistry('demo'), [parse(source)])
    const before = idsByPosition(first, 'src/Demo.tsx', 3)

    const edited = source.replace('<p>Note</p>', '<p>Note</p>\n          <span>New</span>')
    const second = sync(first.registry, [parse(edited)])
    const after = idsByPosition(second, 'src/Demo.tsx', 4)

    expect(after.slice(0, 3)).toEqual(before)
    expect(second.counts.added).toBe(1)
    expect(second.counts.preserved).toBe(3)
  })

  it('preserves ids across a file move and a component rename', () => {
    const first = sync(emptyRegistry('demo'), [parse(source)])
    const before = idsByPosition(first, 'src/Demo.tsx', 3)

    const moved = parse(source.replace('Demo', 'PaymentDemo'), 'src/payments/Demo.tsx')
    const second = sync(first.registry, [moved])

    expect(idsByPosition(second, 'src/payments/Demo.tsx', 3)).toEqual(before)
    expect(second.counts.moved).toBe(3)
    expect(second.counts.tombstoned).toBe(0)
  })

  it('tombstones a removed element rather than deleting it', () => {
    const first = sync(emptyRegistry('demo'), [parse(source)])
    const removed = source.replace('<p>Note</p>', '')
    const second = sync(first.registry, [parse(removed)])

    const tombstoned = second.registry.entries.filter((entry) => entry.status === 'tombstoned')
    expect(tombstoned).toHaveLength(1)
    expect(tombstoned[0]!.elementType).toBe('p')
  })

  it('drops tombstones once their retention has passed', () => {
    const first = sync(emptyRegistry('demo'), [parse(source)])
    const removed = source.replace('<p>Note</p>', '')
    const tombstoned = sync(first.registry, [parse(removed)])
    expect(tombstoned.registry.entries.some((entry) => entry.status === 'tombstoned')).toBe(true)

    // Retention is measured on a later run, not on the run that tombstoned it:
    // an anchor written moments ago still deserves an explicit "gone".
    const aged = syncRegistry({
      registry: tombstoned.registry,
      files: [parse(removed)],
      ambiguousMatchThreshold: 0.9,
      tombstoneRetentionDays: 90,
      now: () => '2027-06-01T00:00:00.000Z',
    })
    expect(aged.registry.entries.some((entry) => entry.status === 'tombstoned')).toBe(false)
  })

  it('follows an explicit key through a move and a rewrite', () => {
    const keyed = `
      export function Demo() {
        return <button data-de-provenance-key="submit-payment" type="submit">Submit</button>
      }
    `
    const first = sync(emptyRegistry('demo'), [parse(keyed)])
    const id = first.assignments.get('src/Demo.tsx#0')

    const rewritten = `
      export function PaymentPanel() {
        return (
          <Wrapper>
            <button data-de-provenance-key="submit-payment" className="cta" onClick={send}>
              Send instruction
            </button>
          </Wrapper>
        )
      }
    `
    const second = sync(first.registry, [parse(rewritten, 'src/payments/Panel.tsx')])
    expect(second.assignments.get('src/payments/Panel.tsx#1')).toBe(id)
  })

  it('refuses two identical explicit keys in one component', () => {
    const duplicated = `
      export function Demo() {
        return (
          <div>
            <button data-de-provenance-key="go">A</button>
            <button data-de-provenance-key="go">B</button>
          </div>
        )
      }
    `
    try {
      sync(emptyRegistry('demo'), [parse(duplicated)])
      throw new Error('expected a duplicate key failure')
    } catch (error) {
      expect(isUipError(error) && error.code).toBe('UIP_DUPLICATE_EXPLICIT_KEY')
    }
  })

  it('fails rather than guessing when two identities are equally plausible', () => {
    // The same explicit key in two components is legal: keys are unique within
    // a component, not within a file.
    const twoComponents = `
      export function One() {
        return <button data-de-provenance-key="go">A</button>
      }
      export function Two() {
        return <button data-de-provenance-key="go">B</button>
      }
    `
    const first = sync(emptyRegistry('demo'), [parse(twoComponents)])
    expect(first.counts.added).toBe(2)

    // Merged into a third component, one button is left claiming that key and
    // neither prior identity is a better answer than the other.
    const merged = `
      export function Three() {
        return <button data-de-provenance-key="go">A or B</button>
      }
    `
    try {
      sync(first.registry, [parse(merged)])
      throw new Error('expected an ambiguity failure')
    } catch (error) {
      expect(isUipError(error) && error.code).toBe('UIP_AMBIGUOUS_IDENTITY')
      expect(isUipError(error) && error.fields.candidates?.length).toBe(2)
      expect(isUipError(error) && error.fields.remediation).toContain('data-de-provenance-key')
    }
  })
})

describe('transformation', () => {
  it('marks host elements and leaves untested components alone', () => {
    const result = instrument(`
      import { Button } from '@salt-ds/core'
      export const A = () => (
        <div>
          <Button>Go</Button>
        </div>
      )
    `)
    expect(result.code).toMatch(/<div data-de-provenance-id="prv_/)
    // No browser-tested catalog entry, so the compiler does not guess.
    expect(result.code).not.toMatch(/<Button[^>]*data-de-provenance-id/)
    const note = result.injections.find((injection) => !injection.instrumented)
    expect(note?.note).toContain('no browser-tested compatibility entry')
  })

  it('preserves refs, keys, spreads, fragments and conditional JSX', () => {
    const result = instrument(`
      export const A = ({ rows, rest, show }) => (
        <>
          <ul ref={listRef} {...rest}>
            {rows.map((row) => (
              <li key={row.id}>{row.label}</li>
            ))}
          </ul>
          {show ? <p>shown</p> : null}
        </>
      )
    `)
    expect(result.code).toContain('ref={listRef}')
    expect(result.code).toContain('{...rest}')
    expect(result.code).toContain('key={row.id}')
    expect(result.code).toContain('show ?')
    // The attribute is appended after the spread so an author's own props
    // cannot overwrite it.
    expect(result.code).toMatch(/\{\.\.\.rest\} data-de-provenance-id=/)
  })

  it('leaves an already-marked element untouched', () => {
    const result = instrument(`export const A = () => <div data-de-provenance-id="prv_KEPT" />`)
    expect([...result.code.matchAll(/data-de-provenance-id/g)]).toHaveLength(1)
    expect(result.code).toContain('prv_KEPT')
  })
})

describe('production guard', () => {
  it('fails a production build that asks for instrumentation', () => {
    expect(() => assertNoProductionInstrumentation('production', true)).toThrowError(
      /UIP_PRODUCTION_GUARD/,
    )
    expect(() => assertNoProductionInstrumentation('production', false)).not.toThrow()
    expect(() => assertNoProductionInstrumentation('development', true)).not.toThrow()
  })

  it('keeps every generated attribute under one prefix, so artifacts can be scanned', () => {
    const result = instrument(`export const A = () => <div><span>x</span></div>`)
    const generated = [...result.code.matchAll(/data-de-[a-z-]+/g)].map((match) => match[0])
    expect(generated.length).toBeGreaterThan(0)
    expect(generated.every((attribute) => attribute.startsWith(ATTR_PREFIX))).toBe(true)
  })
})

describe('boundaries and hygiene', () => {
  it('never walks into dependencies', async () => {
    const { mkdir, mkdtemp, rm, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { discoverSourceFiles } = await import('../src/compiler/discover.js')

    const root = await mkdtemp(join(tmpdir(), 'uip-scan-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(join(root, 'node_modules/@vendor/grid/src'), { recursive: true })
    await writeFile(join(root, 'src/App.tsx'), 'export const A = () => <div />', 'utf8')
    await writeFile(
      join(root, 'node_modules/@vendor/grid/src/Grid.tsx'),
      'export const G = () => <div />',
      'utf8',
    )

    const files = await discoverSourceFiles({
      root,
      include: ['**/*.{jsx,tsx}'],
      exclude: [],
    })
    expect(files).toEqual(['src/App.tsx'])
    await rm(root, { recursive: true, force: true })
  })

  it('records repository-relative paths and no source text', async () => {
    const { mkdir, mkdtemp, rm, writeFile } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { prepareProject } = await import('../src/compiler/project.js')

    const root = await mkdtemp(join(tmpdir(), 'uip-paths-'))
    await mkdir(join(root, 'src'), { recursive: true })
    await writeFile(join(root, 'package.json'), '{"name":"paths"}', 'utf8')
    await writeFile(
      join(root, 'src/Secret.tsx'),
      'const token = "hunter2"\nexport const A = () => <div title="visible copy">{token}</div>',
      'utf8',
    )

    const project = await prepareProject({
      root,
      config: {
        applicationId: 'paths-app',
        repository: 'test/paths',
        include: ['src/**/*.tsx'],
        exclude: [],
        registry: '.ui-provenance/registry.json',
        saltPackages: [],
        ambiguousMatchThreshold: 0.9,
        tombstoneRetentionDays: 90,
        productionDisabled: true,
      },
      mode: 'sync',
    })

    const serialized = JSON.stringify(project.manifest())
    expect(serialized).toContain('"src/Secret.tsx"')
    // No workstation paths, and no source contents.
    expect(serialized).not.toContain(root)
    expect(serialized).not.toContain('hunter2')
    expect(serialized).not.toContain('visible copy')
    await rm(root, { recursive: true, force: true })
  })

  it('rejects a document written by a newer major schema', async () => {
    const { assertSchemaVersion } = await import('../src/core/validate.js')
    expect(() => assertSchemaVersion({ schemaVersion: '1.4' }, '1.0', 'UIP_MANIFEST_MISMATCH')).not.toThrow()
    expect(() => assertSchemaVersion({ schemaVersion: '2.0' }, '1.0', 'UIP_MANIFEST_MISMATCH')).toThrow(
      /unsupported schema version/,
    )
    expect(() => assertSchemaVersion({}, '1.0', 'UIP_MANIFEST_MISMATCH')).toThrow(/no schemaVersion/)
  })
})
