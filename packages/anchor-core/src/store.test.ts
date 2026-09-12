import { beforeEach, describe, expect, it } from 'vitest'
import { captureAnchor } from './capture.js'
import { createResolutionContext } from './index-dom.js'
import { FeedbackStore } from './store.js'
import type { Actor } from './types.js'
import { ID, htmlV1, htmlV2, lockV1, lockV2, manifestV1, manifestV2, mount } from './__fixtures__/dom.js'

const designer: Actor = { id: 'u-dw', name: 'Dana Whitfield', role: 'design' }
const engineer: Actor = { id: 'u-mo', name: 'Miles Okonjo', role: 'engineering' }

function seed() {
  const root = mount(htmlV1())
  const ctx = createResolutionContext({ root, manifest: manifestV1, lock: lockV1 })
  const store = new FeedbackStore({ lock: lockV1, buildId: 'build-a' })
  const at = (selector: string) => captureAnchor(root.querySelector(selector)!, ctx)
  return { root, ctx, store, at }
}

function rebuild() {
  const root = mount(htmlV2())
  return createResolutionContext({ root, manifest: manifestV2, lock: lockV2 })
}

describe('feedback store', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('gives every thread a named owner at creation', () => {
    const { store, at } = seed()
    const thread = store.createThread({ anchor: at(`[data-de-provenance-id="${ID.badge}"]`), author: designer, body: 'error status, not caution' })
    expect(thread.owner).toEqual(designer)

    const assigned = store.createThread({
      anchor: at(`[data-de-provenance-id="${ID.button}"]`),
      author: designer,
      body: 'should go through the entitlement-gated hook',
      owner: engineer,
    })
    expect(assigned.owner).toEqual(engineer)
  })

  it('re-anchors the open set against a rebuild and reports the orphan rate', () => {
    const { store, at } = seed()
    store.createThread({ anchor: at(`[data-de-provenance-id="${ID.badge}"]`), author: designer, body: 'failed settlement should use the error status' })
    store.createThread({ anchor: at(`[data-de-provenance-id="${ID.button}"]`), author: engineer, body: 'this is the only primary action here, so the one beside it should be bordered' })
    store.createThread({ anchor: at(`[data-de-provenance-id="${ID.heading}"]`), author: designer, body: 'this figure needs a heading above it for the a11y tree' })

    const snapshot = store.reanchor(rebuild(), { buildId: 'build-b' })

    expect(snapshot.total).toBe(3)
    expect(snapshot.orphaned).toBe(1)
    expect(snapshot.orphanRate).toBeCloseTo(1 / 3, 5)
    expect(snapshot.byLevel.provenance).toBe(2)
    expect(snapshot.byLevel.none).toBe(1)

    // The instrumenter's registry carried both surviving ids through the
    // refactor, so they resolve exactly; only the deleted card orphans.
    const [badge, button, heading] = store.threads()
    expect(badge!.anchorStatus).toBe('resolved')
    expect(button!.anchorStatus).toBe('resolved')
    expect(heading!.anchorStatus).toBe('orphaned')
  })

  it('flags staleness as the diff between the two locks, never silently', () => {
    const { store, at } = seed()
    const thread = store.createThread({ anchor: at(`[data-de-provenance-id="${ID.badge}"]`), author: designer, body: 'high density in the main zone' })
    expect(thread.stale).toBe(false)

    store.reanchor(rebuild(), { buildId: 'build-b' })
    expect(thread.stale).toBe(true)
    expect(thread.staleAgainst).toEqual([
      { key: 'designTokens', from: '4.2.1', to: '4.3.0' },
      { key: 'mfes.payments-dash', from: '2.4.1', to: '2.5.0' },
      { key: 'repo.commit', from: 'a41c9ef', to: '7d20b13' },
    ])
  })

  it('leaves resolved threads out of the re-anchor pass', () => {
    const { store, at } = seed()
    const thread = store.createThread({ anchor: at(`[data-de-provenance-id="${ID.heading}"]`), author: designer, body: 'resolved in the last revision' })
    store.setStatus(thread.id, 'resolved')

    const snapshot = store.reanchor(rebuild(), { buildId: 'build-b' })
    expect(snapshot.total).toBe(0)
    expect(thread.anchorStatus).toBe('resolved')
  })

  it('keeps per-build history so orphan rate can be compared across rebuilds', () => {
    const { store, ctx, at } = seed()
    store.createThread({ anchor: at(`[data-de-provenance-id="${ID.badge}"]`), author: designer, body: 'error status, not caution' })

    store.reanchor(ctx, { buildId: 'build-a' })
    store.reanchor(rebuild(), { buildId: 'build-b' })

    expect(store.meter.builds()).toEqual(['build-a', 'build-b'])
    expect(store.meter.snapshot('build-a').orphanRate).toBe(0)
    expect(store.meter.snapshot('build-a').byLevel.provenance).toBe(1)
    expect(store.meter.snapshot().total).toBe(2)
  })

  it('notifies subscribers so a preview can react without polling', () => {
    const { store, at } = seed()
    const events: string[] = []
    store.subscribe((event) => events.push(event.type))

    const thread = store.createThread({ anchor: at(`[data-de-provenance-id="${ID.badge}"]`), author: designer, body: 'error status, not caution' })
    store.addComment(thread.id, engineer, 'that is an L2 token change')
    store.reanchor(rebuild(), { buildId: 'build-b' })

    expect(events).toEqual(['thread-created', 'comment-added', 'reanchored'])
  })
})
