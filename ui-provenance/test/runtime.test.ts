import { beforeEach, describe, expect, it } from 'vitest'
import { createProvenanceRuntime } from '../src/runtime/index.js'
import type { ProvenanceManifest } from '../src/core/types.js'

const SOURCE_BADGE = 'prv_01M29J9WHH63Q297TKCABQZWTX'
const SOURCE_CARD = 'prv_01M29J9WHHYSHQ7HHYD1FYX05Y'

function manifest(overrides: Partial<ProvenanceManifest> = {}): ProvenanceManifest {
  return {
    schemaVersion: '1.0',
    applicationId: 'payments-web',
    federation: { name: 'payments_dash', role: 'remote', exposes: ['./PaymentsDash'] },
    repository: 'github/roughcompass/management-console',
    commitSha: 'a41c9ef',
    buildId: 'payments-web-a41c9ef-1',
    packageVersions: { react: '19.3.0', '@salt-ds/core': '1.67.0' },
    registryHash: `sha256:${'0'.repeat(64)}`,
    generatedAt: '2026-09-12T00:00:00.000Z',
    sources: {
      [SOURCE_BADGE]: {
        sourceId: SOURCE_BADGE,
        humanName: 'StatusBadge.span',
        file: 'src/v1/PaymentsDash.tsx',
        line: 14,
        column: 5,
        enclosingComponent: 'StatusBadge',
        elementType: 'span',
        elementKind: 'host',
        parentSourceId: null,
        instrumented: true,
      },
      [SOURCE_CARD]: {
        sourceId: SOURCE_CARD,
        humanName: 'PaymentsDash.Card',
        file: 'src/v1/PaymentsDash.tsx',
        line: 40,
        column: 5,
        enclosingComponent: 'PaymentsDash',
        elementType: 'Card',
        elementKind: 'salt',
        parentSourceId: null,
        library: { name: '@salt-ds/core', version: '1.67.0', component: 'Card' },
        instrumented: true,
      },
    },
    ...overrides,
  }
}

function runtimeWith(document: ProvenanceManifest) {
  return createProvenanceRuntime({ fetchManifest: async () => document })
}

async function register(runtime: ReturnType<typeof runtimeWith>, doc = manifest(), root?: Element) {
  await runtime.registerBuild({
    applicationId: doc.applicationId,
    federationName: doc.federation.name,
    federationRole: doc.federation.role,
    buildId: doc.buildId,
    commitSha: doc.commitSha,
    manifestUrl: 'http://localhost:5274/ui-provenance-manifest.json',
    root,
  })
}

describe('runtime resolution', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('resolves an instrumented element to its build, file and component', async () => {
    document.body.innerHTML = `<section><span data-de-provenance-id="${SOURCE_BADGE}">settled</span></section>`
    const runtime = runtimeWith(manifest())
    await register(runtime)

    const resolution = await runtime.resolveElement(document.querySelector('span')!)
    expect(resolution.confidence).toBe('exact')
    expect(resolution.anchor).toMatchObject({
      applicationId: 'payments-web',
      federationName: 'payments_dash',
      commitSha: 'a41c9ef',
      sourceId: SOURCE_BADGE,
      humanName: 'StatusBadge.span',
      source: { file: 'src/v1/PaymentsDash.tsx', line: 14, enclosingComponent: 'StatusBadge' },
    })
  })

  it('records the design-system package and version for a Salt invocation', async () => {
    document.body.innerHTML = `<div data-de-provenance-id="${SOURCE_CARD}">exposure</div>`
    const runtime = runtimeWith(manifest())
    await register(runtime)

    const resolution = await runtime.resolveElement(document.querySelector('div')!)
    expect(resolution.anchor?.library).toEqual({
      name: '@salt-ds/core',
      version: '1.67.0',
      component: 'Card',
    })
  })

  it('carries hashes, never the visible text', async () => {
    document.body.innerHTML = `<span data-de-provenance-id="${SOURCE_BADGE}" aria-label="Settled position">settled</span>`
    const runtime = runtimeWith(manifest())
    await register(runtime)

    const resolution = await runtime.resolveElement(document.querySelector('span')!)
    const serialized = JSON.stringify(resolution.anchor)
    expect(serialized).not.toContain('Settled position')
    expect(serialized).not.toContain('settled')
    expect(resolution.anchor?.fallback.accessibleNameHash).toMatch(/^[0-9a-f]{16}$/)
    expect(resolution.anchor?.fallback.accessibleRole).toBeUndefined()
  })

  it('caps a repeated instance at weak, and says why', async () => {
    document.body.innerHTML = `
      <span data-de-provenance-id="${SOURCE_BADGE}">settled</span>
      <span data-de-provenance-id="${SOURCE_BADGE}">pending</span>`
    const runtime = runtimeWith(manifest())
    await register(runtime)

    const resolution = await runtime.resolveElement(document.querySelectorAll('span')[1]!)
    expect(resolution.confidence).toBe('weak')
    expect(runtime.getDiagnostics()[0]?.code).toBe('UIP_INSTANCE_AMBIGUOUS')
  })

  it('reaches exact when the application supplies an instance key', async () => {
    document.body.innerHTML = `
      <span data-de-provenance-id="${SOURCE_BADGE}" data-de-instance-key="p-4411">settled</span>
      <span data-de-provenance-id="${SOURCE_BADGE}" data-de-instance-key="p-4412">pending</span>`
    const runtime = runtimeWith(manifest())
    await register(runtime)

    const resolution = await runtime.resolveElement(document.querySelectorAll('span')[1]!)
    expect(resolution.confidence).toBe('exact')
    expect(resolution.anchor?.instanceKey).toBe('p-4412')
  })

  it('refuses an element that belongs to no registered build', async () => {
    document.body.innerHTML = '<div><span>uninstrumented</span></div>'
    const runtime = runtimeWith(manifest())

    const resolution = await runtime.resolveElement(document.querySelector('span')!)
    expect(resolution.confidence).toBe('unresolved')
    expect(runtime.getDiagnostics()[0]?.code).toBe('UIP_REMOTE_UNREGISTERED')
  })

  it('reports an unsupported boundary rather than guessing at the host', async () => {
    document.body.innerHTML = '<iframe></iframe>'
    const runtime = runtimeWith(manifest())
    await register(runtime)

    const resolution = await runtime.resolveElement(document.querySelector('iframe')!)
    expect(resolution.confidence).toBe('unresolved')
    expect(runtime.getDiagnostics()[0]?.code).toBe('UIP_UNSUPPORTED_BOUNDARY')
  })

  it('crosses an open shadow boundary to find the owning element', async () => {
    document.body.innerHTML = `<div data-de-provenance-id="${SOURCE_BADGE}"><div id="host"></div></div>`
    const host = document.querySelector('#host')!
    const shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = '<button id="inner">Go</button>'

    const runtime = runtimeWith(manifest())
    await register(runtime)

    const inner = shadow.querySelector('#inner')!
    const resolution = await runtime.resolveElement(inner)
    expect(resolution.anchor?.sourceId).toBe(SOURCE_BADGE)
  })

  it('rejects a manifest that describes a different build', async () => {
    const runtime = runtimeWith(manifest())
    await expect(
      runtime.registerBuild({
        applicationId: 'payments-web',
        federationName: 'payments_dash',
        federationRole: 'remote',
        buildId: 'a-different-build',
        commitSha: 'a41c9ef',
        manifestUrl: 'http://localhost:5274/ui-provenance-manifest.json',
      }),
    ).rejects.toThrow(/UIP_MANIFEST_MISMATCH/)
  })
})

describe('re-resolution across builds', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('holds at strong when the id survives into a new build', async () => {
    document.body.innerHTML = `<span data-de-provenance-id="${SOURCE_BADGE}">settled</span>`
    const first = runtimeWith(manifest())
    await register(first)
    const anchor = (await first.resolveElement(document.querySelector('span')!)).anchor!

    const next = manifest({ buildId: 'payments-web-7d20b13-2', commitSha: '7d20b13' })
    const second = runtimeWith(next)
    await register(second, next)

    const resolution = await second.reResolve(anchor)
    expect(resolution.confidence).toBe('strong')
    expect(resolution.anchor?.buildId).toBe('payments-web-7d20b13-2')
    expect(resolution.element).toBe(document.querySelector('span'))
  })

  it('reports an orphan when the element left the build', async () => {
    document.body.innerHTML = `<span data-de-provenance-id="${SOURCE_BADGE}">settled</span>`
    const first = runtimeWith(manifest())
    await register(first)
    const anchor = (await first.resolveElement(document.querySelector('span')!)).anchor!

    document.body.innerHTML = ''
    const stripped = manifest({
      buildId: 'payments-web-7d20b13-2',
      sources: { [SOURCE_CARD]: manifest().sources[SOURCE_CARD]! },
    })
    const second = runtimeWith(stripped)
    await register(second, stripped)

    const resolution = await second.reResolve(anchor)
    expect(resolution.confidence).toBe('unresolved')
    expect(second.getDiagnostics()[0]?.code).toBe('UIP_ANCHOR_ORPHANED')
  })

  it('separates "not on this screen" from "gone"', async () => {
    document.body.innerHTML = `<span data-de-provenance-id="${SOURCE_BADGE}">settled</span>`
    const runtime = runtimeWith(manifest())
    await register(runtime)
    const anchor = (await runtime.resolveElement(document.querySelector('span')!)).anchor!

    // Same build, different route: the element exists but is not rendered.
    document.body.innerHTML = ''
    const resolution = await runtime.reResolve(anchor)
    expect(resolution.confidence).toBe('unresolved')
    expect(resolution.resolutionReason).toContain('not rendered in this view')
    expect(runtime.getDiagnostics().some((d) => d.code === 'UIP_ANCHOR_ORPHANED')).toBe(false)
  })

  it('keeps two remotes with equal human names apart', async () => {
    const other = manifest({
      applicationId: 'profile-web',
      federation: { name: 'profile', role: 'remote', exposes: [] },
      buildId: 'profile-web-1',
    })
    const runtime = createProvenanceRuntime({
      fetchManifest: async (url) => (url.includes('profile') ? other : manifest()),
    })
    await runtime.registerBuild({
      applicationId: 'payments-web',
      federationName: 'payments_dash',
      federationRole: 'remote',
      buildId: 'payments-web-a41c9ef-1',
      commitSha: 'a41c9ef',
      manifestUrl: 'http://localhost:5274/ui-provenance-manifest.json',
    })
    await runtime.registerBuild({
      applicationId: 'profile-web',
      federationName: 'profile',
      federationRole: 'remote',
      buildId: 'profile-web-1',
      commitSha: 'a41c9ef',
      manifestUrl: 'http://localhost:5276/profile/ui-provenance-manifest.json',
    })

    expect(runtime.getBuilds()).toHaveLength(2)
    expect(new Set(runtime.getBuilds().map((build) => build.applicationId)).size).toBe(2)
  })
})

describe('network posture', () => {
  it('sends nothing: the only request is a GET for the build it was told about', async () => {
    document.body.innerHTML = `<span data-de-provenance-id="${SOURCE_BADGE}">settled</span>`

    const calls: Array<{ url: string; method: string }> = []
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: typeof input === 'string' ? input : String(input),
        method: init?.method ?? 'GET',
      })
      return new Response(JSON.stringify(manifest()), { status: 200 })
    }) as typeof fetch

    try {
      // No fetchManifest override: this exercises the real network path.
      const { createProvenanceRuntime } = await import('../src/runtime/index.js')
      const runtime = createProvenanceRuntime()
      await register(runtime as never)
      const resolution = await runtime.resolveElement(document.querySelector('span')!)
      await runtime.reResolve(resolution.anchor!)

      expect(calls).toHaveLength(1)
      expect(calls[0]!.method).toBe('GET')
      expect(calls[0]!.url).toContain('ui-provenance-manifest.json')
    } finally {
      globalThis.fetch = original
    }
  })
})
