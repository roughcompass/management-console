import type { Strategy } from './types.js'
import { nearest, round } from './types.js'

/**
 * Level 4. Survives layout changes. Loses to copy edits, which is the common
 * case for an orphan at this level.
 */
export const textStrategy: Strategy = {
  level: 'text',
  floor: 0.45,
  clean: 0.55,
  run(descriptor, ctx) {
    const anchor = descriptor.text
    if (!anchor) return { reason: 'no text captured' }
    const candidates = ctx.byNormalizedText.get(anchor.normalized) ?? []
    if (candidates.length === 0) return { reason: `text "${anchor.text}" no longer rendered` }

    const sameTag = candidates.filter((n) => n.element.tagName.toLowerCase() === anchor.tag)
    const pool = sameTag.length > 0 ? sameTag : candidates
    const tagBonus = sameTag.length > 0 ? 0.05 : 0

    if (pool.length === 1) {
      return {
        match: { node: pool[0]!, confidence: round(0.6 + tagBonus), reason: 'unique text match' },
        reason: 'matched',
      }
    }
    const byOrdinal = pool[anchor.ordinal]
    if (byOrdinal) {
      return {
        match: { node: byOrdinal, confidence: round(0.52 + tagBonus), reason: `text match, ordinal ${anchor.ordinal}` },
        reason: 'matched',
      }
    }
    return {
      match: {
        node: nearest(pool, descriptor.visual?.rect),
        confidence: round(0.47 + tagBonus),
        reason: `text match, nearest of ${pool.length}`,
      },
      reason: 'matched',
    }
  },
}
