import type { Confidence } from './types.js'

export interface ConfidenceInput {
  /** The source id from the anchor was found in the target build. */
  sourceIdPresent: boolean
  /** The anchor and the target build are the same build of the same app. */
  sameBuild: boolean
  sameApplication: boolean
  /** Exactly one DOM element carries that source id. */
  uniqueInstance: boolean
  /** An authored instance key matched a rendered element. */
  instanceKeyMatched?: boolean
  /** A semantic fallback matched exactly one element. */
  uniqueFallback?: boolean
  boundaryUnsupported?: boolean
}

export interface ConfidenceResult {
  confidence: Confidence
  reason: string
}

/**
 * One place decides confidence, because the difference between strong and weak
 * is the difference between showing a reviewer their comment reattached and
 * asking them first.
 */
export function resolveConfidence(input: ConfidenceInput): ConfidenceResult {
  if (input.boundaryUnsupported) {
    return { confidence: 'unresolved', reason: 'element is behind an unsupported boundary' }
  }
  if (!input.sameApplication) {
    return { confidence: 'unresolved', reason: 'anchor belongs to a different application' }
  }
  if (!input.sourceIdPresent) {
    if (input.uniqueFallback) {
      return { confidence: 'weak', reason: 'source id absent; unique semantic fallback matched' }
    }
    return { confidence: 'unresolved', reason: 'source id not present in this build' }
  }

  if (!input.uniqueInstance) {
    // Repeated renders of one source element. Without an authored instance key
    // there is nothing that distinguishes them, and guessing is the one thing
    // this design refuses to do.
    if (input.instanceKeyMatched) {
      return {
        confidence: input.sameBuild ? 'exact' : 'strong',
        reason: 'source id and instance key matched',
      }
    }
    return {
      confidence: 'weak',
      reason: 'several instances of this source element and no instance key',
    }
  }

  if (input.sameBuild) {
    return { confidence: 'exact', reason: 'source id resolved in the build it was captured on' }
  }
  if (input.instanceKeyMatched) {
    return { confidence: 'exact', reason: 'source id preserved and instance key matched' }
  }
  return { confidence: 'strong', reason: 'source id preserved across builds' }
}

const RANK: Record<Confidence, number> = { exact: 3, strong: 2, weak: 1, unresolved: 0 }

/** Weak results need human confirmation; unresolved ones are never attached. */
export function requiresConfirmation(confidence: Confidence): boolean {
  return RANK[confidence] <= 1
}

export function atLeast(confidence: Confidence, minimum: Confidence): boolean {
  return RANK[confidence] >= RANK[minimum]
}
