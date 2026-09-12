import type { IndexedNode } from '../index-dom.js'
import type { Strategy, StrategyResult } from './types.js'
import { nearest, round } from './types.js'

function pick(
  candidates: IndexedNode[],
  instanceKey: string | undefined,
  ordinal: number,
  base: number,
  label: string,
  rect: { x: number; y: number; width: number; height: number } | undefined,
): StrategyResult {
  if (candidates.length === 0) return { reason: `${label}: no candidates` }
  if (candidates.length === 1) {
    return { match: { node: candidates[0]!, confidence: round(base), reason: `${label}, unique` }, reason: 'matched' }
  }
  if (instanceKey) {
    const keyed = candidates.filter((c) => c.provenance?.instanceKey === instanceKey)
    if (keyed.length === 1) {
      return {
        match: { node: keyed[0]!, confidence: round(base), reason: `${label}, instance key` },
        reason: 'matched',
      }
    }
  }
  const byOrdinal = candidates[ordinal]
  if (byOrdinal) {
    return {
      match: { node: byOrdinal, confidence: round(base - 0.05), reason: `${label}, ordinal ${ordinal}` },
      reason: 'matched',
    }
  }
  return {
    match: { node: nearest(candidates, rect), confidence: round(base - 0.15), reason: `${label}, nearest of ${candidates.length}` },
    reason: 'matched',
  }
}

/**
 * Level 1. Survives cosmetic refactors: class renames, wrapper divs, prop
 * churn. Degrades in steps as the build-time identity erodes - the exact
 * emitted token, then the file, then the component name alone.
 */
export const provenanceStrategy: Strategy = {
  level: 'provenance',
  floor: 0.6,
  clean: 0.9,
  run(descriptor, ctx) {
    const ref = descriptor.provenance
    if (!ref) return { reason: 'no provenance captured' }
    if (!ctx.manifest) return { reason: 'preview has no provenance manifest' }
    const rect = descriptor.visual?.rect

    const exact = ctx.byProvToken.get(ref.token) ?? []
    if (exact.length > 0) {
      return pick(exact, ref.instanceKey, ref.ordinal, 1, 'provenance token', rect)
    }

    const sameComponent = ctx.byComponent.get(ref.component) ?? []
    const sameFile = sameComponent.filter(
      (n) => n.provenance?.file === ref.file && n.provenance?.element === ref.element,
    )
    if (sameFile.length > 0) {
      return pick(sameFile, ref.instanceKey, ref.ordinal, 0.9, 'component in same file', rect)
    }

    if (ref.instanceKey) {
      const keyed = sameComponent.filter((n) => n.provenance?.instanceKey === ref.instanceKey)
      if (keyed.length > 0) return pick(keyed, ref.instanceKey, ref.ordinal, 0.8, 'component + instance key', rect)
    }

    if (sameComponent.length === 1) {
      return {
        match: { node: sameComponent[0]!, confidence: 0.75, reason: 'sole instance of component' },
        reason: 'matched',
      }
    }

    return { reason: `component ${ref.component} not found at ${ref.file}` }
  },
}
