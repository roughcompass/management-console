import { afterEach, describe, expect, it, vi } from 'vitest'
import { PreviewRecorder, declareRuntimeEvents, toUrlPattern } from './instrumentation.js'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('url patterns', () => {
  it('normalises ids so the same call anchors across previews', () => {
    expect(toUrlPattern('/api/accounts/8891/positions')).toBe('/api/accounts/:id/positions')
    expect(toUrlPattern('https://preview.local/api/limits')).toBe('/api/limits')
    expect(toUrlPattern('/api/orders/6f1e2c3d4b5a6978/legs')).toBe('/api/orders/:id/legs')
    expect(toUrlPattern('/api/limits?tenant=markets')).toBe('/api/limits')
  })
})

describe('preview recorder', () => {
  it('records patched fetches with their outcome and restores the original', async () => {
    const recorder = new PreviewRecorder()
    const fake = vi.fn(async () => new Response('{}', { status: 200 }))
    const target = { fetch: fake, addEventListener: () => {}, removeEventListener: () => {} } as unknown as Window &
      typeof globalThis

    const stop = recorder.start(target)
    await target.fetch('/api/accounts/8891/positions')

    expect(recorder.network).toHaveLength(1)
    expect(recorder.network[0]).toMatchObject({
      method: 'GET',
      urlPattern: '/api/accounts/:id/positions',
      status: 200,
      initiator: 'fetch',
    })

    stop()
    expect(target.fetch).toBe(fake)
  })

  it('records a failed request instead of swallowing it', async () => {
    const recorder = new PreviewRecorder()
    const target = {
      fetch: vi.fn(async () => {
        throw new Error('offline')
      }),
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as Window & typeof globalThis

    recorder.start(target)
    await expect(target.fetch('/api/limits')).rejects.toThrow('offline')
    expect(recorder.network[0]).toMatchObject({ failed: true, urlPattern: '/api/limits' })
  })

  it('captures the runtime events a Frame declares', () => {
    const recorder = new PreviewRecorder()
    declareRuntimeEvents(['frame:entitlement-decision'], window)
    const stop = recorder.start(window)

    window.dispatchEvent(
      new CustomEvent('frame:entitlement-decision', {
        detail: { entitlement: 'payments.limits.view', decision: 'allow' },
      }),
    )

    expect(recorder.events[0]).toMatchObject({
      channel: 'frame',
      type: 'entitlement-decision',
      entitlement: 'payments.limits.view',
    })
    stop()
  })

  it('keeps the newest entries and bounds what it holds', () => {
    const recorder = new PreviewRecorder({ maxEntries: 2 })
    for (const id of ['1', '2', '3']) {
      recorder.recordNetwork({
        method: 'GET',
        url: `/api/x/${id}`,
        startedAt: new Date().toISOString(),
        initiator: 'fetch',
      })
    }
    expect(recorder.network.map((entry) => entry.url)).toEqual(['/api/x/3', '/api/x/2'])
  })
})
