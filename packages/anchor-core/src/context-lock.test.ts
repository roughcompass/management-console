import { describe, expect, it } from 'vitest'
import { createContextLock, diffContextLock, isStale } from './context-lock.js'
import { lockV1, lockV2 } from './__fixtures__/dom.js'

const base = {
  frame: '3.1.0',
  frameContracts: '3.1',
  designTokens: '4.2.1',
  capabilityRegistry: '2026-09-11T00:00:00Z',
  lobConventions: 'markets-1.4',
  mfes: { 'payments-dash': '2.4.1', 'limits-panel': '1.2.0' },
  repo: { name: 'roughcompass/management-console', commit: 'a41c9ef' },
}

describe('context lock', () => {
  it('hashes the pinned inputs, not the key order or the build time', () => {
    const a = createContextLock({ ...base, createdAt: '2026-01-01T00:00:00Z' })
    const b = createContextLock({
      ...base,
      mfes: { 'limits-panel': '1.2.0', 'payments-dash': '2.4.1' },
      createdAt: '2026-06-01T00:00:00Z',
    })
    expect(a.id).toBe(b.id)
  })

  it('changes id when any pinned input moves', () => {
    const a = createContextLock(base)
    const b = createContextLock({ ...base, designTokens: '4.3.0' })
    expect(a.id).not.toBe(b.id)
  })

  it('reports which inputs moved rather than a boolean', () => {
    const diff = diffContextLock(lockV1, lockV2)
    expect(diff).toEqual([
      { key: 'designTokens', from: '4.2.1', to: '4.3.0' },
      { key: 'mfes.payments-dash', from: '2.4.1', to: '2.5.0' },
      { key: 'repo.commit', from: 'a41c9ef', to: '7d20b13' },
    ])
  })

  it('flags feedback written against an earlier lock', () => {
    expect(isStale(lockV1.id, lockV2)).toBe(true)
    expect(isStale(lockV1.id, lockV1)).toBe(false)
  })
})
