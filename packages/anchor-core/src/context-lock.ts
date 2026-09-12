import { contentHash } from './hash.js'
import type { ContextLock, ContextLockDiffEntry, ContextLockInput } from './types.js'

/**
 * The context lock is a build input, not a retrieval-time lookup. It is also
 * the audit record: it answers "what was this preview pinned to", which is the
 * question a controls reviewer asks first.
 */
export function createContextLock(input: ContextLockInput): ContextLock {
  const createdAt = input.createdAt ?? new Date().toISOString()
  const pinned = {
    frame: input.frame,
    frameContracts: input.frameContracts,
    designTokens: input.designTokens,
    capabilityRegistry: input.capabilityRegistry,
    lobConventions: input.lobConventions,
    mfes: input.mfes,
    repo: input.repo,
  }
  // createdAt is deliberately excluded from the hash: two builds of the same
  // pinned inputs are the same context, whenever they happened.
  return { ...pinned, createdAt, id: contentHash(pinned) }
}

function flatten(lock: ContextLock): Record<string, string> {
  const flat: Record<string, string> = {
    frame: lock.frame,
    frameContracts: lock.frameContracts,
    designTokens: lock.designTokens,
    capabilityRegistry: lock.capabilityRegistry,
    lobConventions: lock.lobConventions,
    'repo.name': lock.repo.name,
    'repo.commit': lock.repo.commit,
  }
  for (const [name, version] of Object.entries(lock.mfes)) flat[`mfes.${name}`] = version
  return flat
}

/** Every pinned input that moved between two locks. Empty when identical. */
export function diffContextLock(from: ContextLock, to: ContextLock): ContextLockDiffEntry[] {
  const a = flatten(from)
  const b = flatten(to)
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  const diff: ContextLockDiffEntry[] = []
  for (const key of keys) {
    if (a[key] !== b[key]) diff.push({ key, from: a[key], to: b[key] })
  }
  return diff
}

/**
 * Feedback written against version N and applied at N+2 may reference code that
 * no longer exists. Flag it; never silently apply.
 */
export function isStale(capturedLockId: string, current: ContextLock): boolean {
  return capturedLockId !== current.id
}
