import { FeedbackStore, captureAnchor, createContextLock, createResolutionContext } from '@adl/anchor-core'
import type { Actor, ContextLock } from '@adl/anchor-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryRepository } from './repository.js'
import { hydrateFeedbackStore, recordPreviewVersion } from './session.js'

const designer: Actor = { id: 'u-dw', name: 'Dana Whitfield', role: 'design' }
const PREVIEW = 'pr-1042-payments-dash'

const lockA: ContextLock = createContextLock({
  frame: '3.1.0',
  frameContracts: '3.1',
  designTokens: 'salt-1.45.0',
  capabilityRegistry: '2026-09-11T00:00:00Z',
  lobConventions: 'markets-1.4',
  mfes: { 'payments-dash': '2.4.1' },
  repo: { name: 'roughcompass/management-console', commit: 'a41c9ef' },
})

const lockB: ContextLock = createContextLock({
  frame: '3.1.0',
  frameContracts: '3.1',
  designTokens: 'salt-1.46.0',
  capabilityRegistry: '2026-09-11T00:00:00Z',
  lobConventions: 'markets-1.4',
  mfes: { 'payments-dash': '2.5.0' },
  repo: { name: 'roughcompass/management-console', commit: '7d20b13' },
})

function seedStore(repository = createInMemoryRepository()) {
  document.body.innerHTML = '<div id="preview"><span id="badge">settled</span></div>'
  const root = document.querySelector<HTMLElement>('#preview')!
  const ctx = createResolutionContext({ root, lock: lockA })
  const store = new FeedbackStore({ lock: lockA, buildId: 'a' })
  return { repository, store, ctx, root }
}

describe('feedback repository', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('round-trips threads without the live DOM node they resolved to', async () => {
    const { repository, store, ctx, root } = seedStore()
    const anchor = captureAnchor(root.querySelector('#badge')!, ctx)
    const thread = store.createThread({ anchor, author: designer, body: 'wrong blue' })
    store.reanchor(ctx, { buildId: 'a' })
    expect(thread.resolution?.element).not.toBeNull()

    await repository.saveThreads(PREVIEW, store.threads())
    const [restored] = await repository.listThreads(PREVIEW)

    expect(restored!.comments[0]!.body).toBe('wrong blue')
    expect(restored!.anchor.semantic).toBeDefined()
    // A resolution points at an element from a build that is gone.
    expect(restored!.resolution!.element).toBeNull()
  })

  it('keeps a preview version history so staleness can be explained', async () => {
    const repository = createInMemoryRepository()
    await recordPreviewVersion({
      repository,
      previewId: PREVIEW,
      lock: lockA,
      buildId: 'a',
      label: 'A · payments-dash 2.4.1',
      remotes: { 'payments-dash': { version: '2.4.1', entry: 'http://localhost:5274/remoteEntry.js' } },
    })
    await recordPreviewVersion({
      repository,
      previewId: PREVIEW,
      lock: lockB,
      buildId: 'b',
      label: 'B · payments-dash 2.5.0',
    })

    const versions = await repository.listPreviewVersions(PREVIEW)
    expect(versions.map((version) => version.id)).toEqual(['a', 'b'])
    expect(versions[0]!.remotes['payments-dash']!.version).toBe('2.4.1')
  })

  it('rehydrates a session, including every lock the preview has been pinned to', async () => {
    const repository = createInMemoryRepository()
    const { store, ctx, root } = seedStore(repository)
    const anchor = captureAnchor(root.querySelector('#badge')!, ctx)
    store.createThread({ anchor, author: designer, body: 'wrong blue' })
    await repository.saveThreads(PREVIEW, store.threads())
    await recordPreviewVersion({ repository, previewId: PREVIEW, lock: lockA, buildId: 'a', label: 'A' })

    // A reviewer reloads the preview, and the next build is already pinned.
    const revived = await hydrateFeedbackStore({
      repository,
      previewId: PREVIEW,
      lock: lockB,
      buildId: 'b',
    })
    expect(revived.threads()).toHaveLength(1)

    const nextCtx = createResolutionContext({ root, lock: lockB })
    revived.reanchor(nextCtx, { buildId: 'b' })
    const thread = revived.threads()[0]!
    expect(thread.stale).toBe(true)
    // Without the version history this could only say "stale", not what moved.
    expect(thread.staleAgainst).toEqual([
      { key: 'designTokens', from: 'salt-1.45.0', to: 'salt-1.46.0' },
      { key: 'mfes.payments-dash', from: '2.4.1', to: '2.5.0' },
      { key: 'repo.commit', from: 'a41c9ef', to: '7d20b13' },
    ])
  })

  it('persists through the store transport on every mutation', async () => {
    const repository = createInMemoryRepository()
    const { ctx, root } = seedStore(repository)
    const store = await hydrateFeedbackStore({ repository, previewId: PREVIEW, lock: lockA, buildId: 'a' })

    const anchor = captureAnchor(root.querySelector('#badge')!, ctx)
    const thread = store.createThread({ anchor, author: designer, body: 'wrong blue' })
    store.addComment(thread.id, designer, 'and denser rows')
    // Saves are coalesced into a microtask.
    await Promise.resolve()
    await Promise.resolve()

    const stored = await repository.listThreads(PREVIEW)
    expect(stored[0]!.comments.map((comment) => comment.body)).toEqual([
      'wrong blue',
      'and denser rows',
    ])
  })

  it('survives corrupt storage instead of taking the preview down', async () => {
    const driver = {
      read: () => '{not json',
      write: () => {},
    }
    const { DriverFeedbackRepository } = await import('./repository.js')
    const repository = new DriverFeedbackRepository(driver)
    await expect(repository.listThreads(PREVIEW)).resolves.toEqual([])
    await expect(repository.listPreviewVersions(PREVIEW)).resolves.toEqual([])
  })
})
