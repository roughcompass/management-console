import type { ResolutionContext } from './index-dom.js'
import { provenanceStrategy } from './strategies/provenance.js'
import { semanticStrategy } from './strategies/semantic.js'
import { textStrategy } from './strategies/text.js'
import { tokenStrategy } from './strategies/token.js'
import type { Strategy } from './strategies/types.js'
import { visualStrategy } from './strategies/visual.js'
import type { AnchorDescriptor, AnchorLevel, AnchorResolution, StrategyAttempt } from './types.js'
import { ANCHOR_LEVELS } from './types.js'

/** Fixed order, most specific first. Callers do not get to reorder it. */
export const STRATEGY_CHAIN: readonly Strategy[] = [
  provenanceStrategy,
  semanticStrategy,
  tokenStrategy,
  textStrategy,
  visualStrategy,
]

function levelIndex(level: AnchorLevel): number {
  return ANCHOR_LEVELS.indexOf(level)
}

export interface ResolveOptions {
  now?: () => string
  /** Stop the chain early, e.g. to measure how much a single level carries. */
  levels?: readonly AnchorLevel[]
}

function orphan(attempts: StrategyAttempt[], at: string): AnchorResolution {
  return { status: 'orphaned', level: null, confidence: 0, element: null, attempts, resolvedAt: at }
}

function resolveNonVisual(
  descriptor: AnchorDescriptor,
  ctx: ResolutionContext,
  at: string,
): AnchorResolution {
  const target = descriptor.target
  const attempts: StrategyAttempt[] = []
  if (!target) {
    attempts.push({ level: 'provenance', matched: false, confidence: 0, reason: 'no target recorded' })
    return orphan(attempts, at)
  }

  if (target.kind === 'source-symbol' && ctx.manifest) {
    const present = Object.values(ctx.manifest.modules).some((m) => m.file === target.file)
    if (!present) {
      attempts.push({
        level: 'provenance',
        matched: false,
        confidence: 0,
        reason: `${target.file} is not in this build`,
      })
      return orphan(attempts, at)
    }
  }

  // Network, runtime event and build artifact anchors identify themselves by
  // their own payload. They rebind when the interaction recurs in the new
  // preview; the instrumented panel owns that, not the DOM chain.
  attempts.push({ level: 'provenance', matched: true, confidence: 1, reason: `${target.kind} target` })
  return { status: 'resolved', level: 'provenance', confidence: 1, element: null, attempts, resolvedAt: at }
}

/**
 * Walk the chain in order and take the first level that clears its floor.
 * Every level tried is recorded, matched or not: an orphan that cannot say
 * what it tried is an orphan nobody will triage.
 */
export function resolveAnchor(
  descriptor: AnchorDescriptor,
  ctx: ResolutionContext,
  options: ResolveOptions = {},
): AnchorResolution {
  const at = (options.now ?? (() => new Date().toISOString()))()
  if (descriptor.anchorType !== 'visual-node') return resolveNonVisual(descriptor, ctx, at)

  const allowed = options.levels
  const attempts: StrategyAttempt[] = []

  for (const strategy of STRATEGY_CHAIN) {
    if (allowed && !allowed.includes(strategy.level)) continue
    const result = strategy.run(descriptor, ctx)
    const match = result.match
    if (!match || match.confidence < strategy.floor) {
      attempts.push({
        level: strategy.level,
        matched: false,
        confidence: match?.confidence ?? 0,
        reason: match ? `${match.reason} below floor ${strategy.floor}` : result.reason,
      })
      continue
    }

    attempts.push({ level: strategy.level, matched: true, confidence: match.confidence, reason: match.reason })
    const fellDown = levelIndex(strategy.level) > levelIndex(descriptor.capturedLevel)
    const clean = match.confidence >= strategy.clean
    return {
      status: fellDown || !clean ? 'degraded' : 'resolved',
      level: strategy.level,
      confidence: match.confidence,
      element: match.node.element,
      attempts,
      resolvedAt: at,
    }
  }

  return orphan(attempts, at)
}

export function resolveAll(
  descriptors: readonly AnchorDescriptor[],
  ctx: ResolutionContext,
  options: ResolveOptions = {},
): AnchorResolution[] {
  return descriptors.map((descriptor) => resolveAnchor(descriptor, ctx, options))
}
