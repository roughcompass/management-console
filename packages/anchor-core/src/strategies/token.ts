import type { IndexedNode } from '../index-dom.js'
import type { Strategy } from './types.js'
import { centerDistance, round } from './types.js'

/**
 * Level 3. Survives component restructuring: whatever the tree looks like now,
 * the contested property is still produced by the same token. Deliberately
 * capped low - a token is shared by construction, so this level locates a
 * plausible node, not a certain one.
 */
export const tokenStrategy: Strategy = {
  level: 'token',
  floor: 0.5,
  clean: 0.6,
  run(descriptor, ctx) {
    const tokens = descriptor.tokens ?? []
    if (tokens.length === 0) return { reason: 'no token references captured' }

    const counts = new Map<IndexedNode, number>()
    for (const ref of tokens) {
      for (const node of ctx.byDesignToken.get(ref.token) ?? []) {
        counts.set(node, (counts.get(node) ?? 0) + 1)
      }
    }
    if (counts.size === 0) return { reason: `token ${tokens[0]!.token} is not bound anywhere in this build` }

    const rect = descriptor.visual?.rect
    const normalized = descriptor.text?.normalized
    let best: IndexedNode | undefined
    let bestScore = -1
    for (const [node, hits] of counts) {
      const overlap = hits / tokens.length
      let score = 0.45 + 0.25 * overlap
      if (normalized && node.text?.normalized === normalized) score += 0.08
      if (counts.size === 1) score += 0.07
      if (rect) score -= Math.min(0.05, centerDistance(node.rect, rect) / 20_000)
      if (score > bestScore) {
        best = node
        bestScore = score
      }
    }

    if (!best) return { reason: 'no token candidate' }
    return {
      match: { node: best, confidence: round(Math.min(0.8, bestScore)), reason: 'token binding match' },
      reason: 'matched',
    }
  },
}
