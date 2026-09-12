import { beforeEach, describe, expect, it } from 'vitest'
import { captureAnchor, captureNonVisualAnchor } from './capture.js'
import { createResolutionContext } from './index-dom.js'
import { resolveAnchor } from './resolve.js'
import type { AnchorDescriptor, Rect } from './types.js'
import { htmlV1, htmlV2, lockV1, lockV2, manifestV1, manifestV2, mount } from './__fixtures__/dom.js'

function contextV1() {
  const root = mount(htmlV1())
  return { root, ctx: createResolutionContext({ root, manifest: manifestV1, lock: lockV1 }) }
}

function contextV2(options: { manifest?: typeof manifestV2; html?: string } = {}) {
  const root = mount(options.html ?? htmlV2())
  return { root, ctx: createResolutionContext({ root, manifest: options.manifest, lock: lockV2 }) }
}

function anchorFor(selector: string): AnchorDescriptor {
  const { root, ctx } = contextV1()
  const element = root.querySelector(selector)
  if (!element) throw new Error(`fixture has no ${selector}`)
  return captureAnchor(element, ctx)
}

function withRect(element: Element, rect: Rect): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ ...rect, top: rect.y, left: rect.x, right: rect.x + rect.width, bottom: rect.y + rect.height, toJSON: () => rect }),
  })
}

describe('anchor capture', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('captures every level of the chain at once', () => {
    const anchor = anchorFor('[data-prov="m1:9:5"]')
    expect(anchor.capturedLevel).toBe('provenance')
    expect(anchor.provenance).toMatchObject({
      component: 'StatusBadge',
      element: 'span',
      file: 'src/mfes/payments/v1/PaymentsDash.tsx',
      instanceKey: 'p-4411',
      ordinal: 0,
    })
    expect(anchor.semantic!.segments.map((s) => s.kind)).toEqual([
      'frame',
      'zone',
      'mfe',
      'component',
      'component',
      'element',
    ])
    expect(anchor.tokens!.map((t) => t.token)).toEqual([
      'color.status.settled.background',
      'radius.pill',
    ])
    expect(anchor.text).toMatchObject({ normalized: 'settled', tag: 'span' })
    expect(anchor.contextLockId).toBe(lockV1.id)
  })

  it('falls back to the best level available when the MFE is not instrumented', () => {
    const root = mount(htmlV1())
    const ctx = createResolutionContext({ root, lock: lockV1 })
    const anchor = captureAnchor(root.querySelector('[data-prov="m1:9:5"]')!, ctx)
    expect(anchor.provenance).toBeUndefined()
    expect(anchor.capturedLevel).toBe('semantic')
  })
})

describe('resolution chain', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('re-anchors exactly on the build it was written against', () => {
    const anchor = anchorFor('[data-prov="m1:9:5"]')
    const { root, ctx } = contextV1()
    const resolution = resolveAnchor(anchor, ctx)
    expect(resolution.status).toBe('resolved')
    expect(resolution.level).toBe('provenance')
    expect(resolution.confidence).toBe(1)
    expect(resolution.element).toBe(root.querySelector('[data-prov="m1:9:5"]'))
  })

  it('survives a move to a new file via the authored instance key, at a cost', () => {
    const anchor = anchorFor('[data-prov="m1:9:5"]')
    const { root, ctx } = contextV2({ manifest: manifestV2 })
    const resolution = resolveAnchor(anchor, ctx)
    expect(resolution.level).toBe('provenance')
    // Same level, lower confidence: the anchor held, but it is no longer exact.
    expect(resolution.status).toBe('degraded')
    expect(resolution.confidence).toBe(0.8)
    expect(resolution.element).toBe(root.querySelector('[data-prov-key="p-4411"][data-prov="m2:14:5"]'))
  })

  it('holds a keyless node when its component is still the only one of its kind', () => {
    const anchor = anchorFor('[data-prov="m1:40:7"]')
    const { root, ctx } = contextV2({ manifest: manifestV2 })
    const resolution = resolveAnchor(anchor, ctx)
    expect(resolution.level).toBe('provenance')
    expect(resolution.confidence).toBe(0.75)
    expect(resolution.element).toBe(root.querySelector('button'))
  })

  it('falls to the token level when the new build carries no provenance at all', () => {
    const anchor = anchorFor('[data-prov="m1:9:5"]')
    const { ctx } = contextV2()
    const resolution = resolveAnchor(anchor, ctx)
    expect(resolution.level).toBe('token')
    expect(resolution.status).toBe('degraded')
    expect(resolution.element?.textContent).toContain('settled')
  })

  it('falls to the text level when the token binding is gone too', () => {
    const anchor = anchorFor('[data-prov="m1:9:5"]')
    const { ctx } = contextV2({ html: htmlV2().replace(/ data-tokens="[^"]*"/g, '') })
    const resolution = resolveAnchor(anchor, ctx)
    expect(resolution.level).toBe('text')
    expect(resolution.element?.textContent).toContain('settled')
  })

  it('orphans a node that the rebuild removed, and says what it tried', () => {
    const anchor = anchorFor('[data-prov="m1:31:7"]')
    const { ctx } = contextV2({ manifest: manifestV2 })
    const resolution = resolveAnchor(anchor, ctx)
    expect(resolution.status).toBe('orphaned')
    expect(resolution.element).toBeNull()
    expect(resolution.attempts.map((a) => a.level)).toEqual([
      'provenance',
      'semantic',
      'token',
      'text',
      'visual',
    ])
    expect(resolution.attempts.every((a) => a.matched === false)).toBe(true)
    expect(resolution.attempts[0]!.reason).toContain('SummaryCard')
  })

  it('will not confidently match a sibling that shares the path but nothing else', () => {
    // Two plain divs inside one component share a semantic path exactly. What
    // the node carries itself - its own text, its token bindings - is the only
    // thing that tells them apart.
    const html = (card: string) => `
      <div data-frame="cib-frame">
        <main data-zone="main">
          <section data-mfe="payments-dash" data-mfe-version="2.4.1" data-prov="m1:40:7">
            ${card}
            <div class="head">Payments</div>
          </section>
        </main>
      </div>`
    const root = mount(html('<div class="card" data-tokens="type.display.sm=font-size"></div>'))
    const ctx = createResolutionContext({ root, manifest: manifestV1, lock: lockV1 })
    const anchor = captureAnchor(root.querySelector('.card')!, ctx)
    expect(anchor.capturedLevel).toBe('semantic')

    // The rebuild drops the commented node and keeps its sibling.
    const rebuilt = mount(html(''))
    const after = createResolutionContext({ root: rebuilt, manifest: manifestV1, lock: lockV1 })
    const resolution = resolveAnchor(anchor, after)

    // The region is still right, so the comment stays attached - but it is
    // reported as degraded with the contradiction named, never as resolved.
    expect(resolution.status).toBe('degraded')
    expect(resolution.level).toBe('semantic')
    expect(resolution.confidence).toBeLessThan(0.8)
    expect(resolution.attempts.at(-1)!.reason).toContain('text or tokens changed')
  })

  it('addresses a node rendered by an uninstrumented design-system component', () => {
    // The wrapper comes from a component library, so it carries no provenance
    // of its own; its path still runs through the app component that placed it.
    const html = (extra: string) => `
      <div data-frame="cib-frame">
        <main data-zone="main">
          <section data-mfe="payments-dash" data-mfe-version="2.4.1">
            <span data-prov="m1:40:7"></span>
            <div class="saltCard" data-tokens="color.surface.raised=background-color">${extra}</div>
          </section>
        </main>
      </div>`
    const root = mount(html('<p>Unsettled exposure</p>'))
    const ctx = createResolutionContext({ root, manifest: manifestV1, lock: lockV1 })
    const anchor = captureAnchor(root.querySelector('.saltCard')!, ctx)
    expect(anchor.provenance).toBeUndefined()
    expect(anchor.capturedLevel).toBe('semantic')

    const rebuilt = mount(html('<p>Unsettled exposure</p><small>2 of 4</small>'))
    const after = createResolutionContext({ root: rebuilt, manifest: manifestV1, lock: lockV1 })
    const resolution = resolveAnchor(anchor, after)

    expect(resolution.level).toBe('semantic')
    expect(resolution.element).toBe(rebuilt.querySelector('.saltCard'))
  })

  it('uses the visual level only under the same theme and viewport', () => {
    const root = mount('<div><div id="target"><div id="inner"></div></div></div>')
    const target = root.querySelector('#target')!
    withRect(target, { x: 40, y: 120, width: 200, height: 48 })
    const ctx = createResolutionContext({ root, lock: lockV1 })
    const anchor = captureAnchor(target, ctx)
    expect(anchor.capturedLevel).toBe('visual')

    const rebuilt = mount('<div><div id="moved"><span></span></div></div>')
    const moved = rebuilt.querySelector('#moved')!
    withRect(moved, { x: 44, y: 124, width: 196, height: 46 })

    const sameViewport = createResolutionContext({ root: rebuilt, lock: lockV2 })
    const hit = resolveAnchor(anchor, sameViewport)
    expect(hit.level).toBe('visual')
    expect(hit.element).toBe(moved)

    const narrower = createResolutionContext({
      root: rebuilt,
      lock: lockV2,
      viewport: { width: 768, height: 1024 },
    })
    const miss = resolveAnchor(anchor, narrower)
    expect(miss.status).toBe('orphaned')
    expect(miss.attempts.at(-1)!.reason).toContain('viewport changed')
  })

  it('resolves a source-symbol anchor against the build, not the DOM', () => {
    const { ctx } = contextV1()
    const present = captureNonVisualAnchor(
      { kind: 'source-symbol', repo: 'roughcompass/management-console', file: 'src/mfes/payments/v1/PaymentsDash.tsx', symbol: 'PositionsTable' },
      ctx,
    )
    expect(resolveAnchor(present, ctx).status).toBe('resolved')

    const gone = captureNonVisualAnchor(
      { kind: 'source-symbol', repo: 'roughcompass/management-console', file: 'src/deleted/Thing.tsx', symbol: 'Thing' },
      ctx,
    )
    const resolution = resolveAnchor(gone, ctx)
    expect(resolution.status).toBe('orphaned')
    expect(resolution.attempts[0]!.reason).toContain('not in this build')
  })

  it('keeps a network anchor resolvable without any DOM at all', () => {
    const { ctx } = contextV1()
    const anchor = captureNonVisualAnchor(
      { kind: 'network', method: 'GET', url: '/api/accounts/8891/positions', urlPattern: '/api/accounts/:id/positions', status: 200 },
      ctx,
    )
    expect(anchor.anchorType).toBe('network-interaction')
    expect(resolveAnchor(anchor, ctx).status).toBe('resolved')
  })
})
