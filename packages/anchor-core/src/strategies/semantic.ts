import type { IndexedNode } from '../index-dom.js'
import { matchSemanticPath } from '../semantic-path.js'
import type { SemanticPath } from '../types.js'
import type { Strategy } from './types.js'
import { centerDistance, round } from './types.js'

function tailComponent(path: SemanticPath): string | undefined {
  for (let i = path.segments.length - 1; i >= 0; i--) {
    const segment = path.segments[i]!
    if (segment.kind === 'component') return segment.name
  }
  return undefined
}

function tailElement(path: SemanticPath): string | undefined {
  const last = path.segments[path.segments.length - 1]
  return last?.kind === 'element' ? last.name : undefined
}

/**
 * Level 2. Survives DOM churn and class name changes, and survives an MFE
 * version bump at a small confidence cost. Candidates are narrowed by the tail
 * component so a large preview does not cost a full path build per node.
 */
export const semanticStrategy: Strategy = {
  level: 'semantic',
  floor: 0.55,
  clean: 0.8,
  run(descriptor, ctx) {
    const target = descriptor.semantic
    if (!target || target.segments.length === 0) return { reason: 'no semantic path captured' }
    // A path of nothing but a tag name would match any node of that tag. That
    // is not a match, it is a coin toss with a confidence score attached.
    if (!target.segments.some((segment) => segment.kind !== 'element')) {
      return { reason: 'path carries only an element tag' }
    }

    const component = tailComponent(target)
    const element = tailElement(target)
    let candidates: IndexedNode[] = component ? (ctx.byComponent.get(component) ?? []) : []
    if (candidates.length === 0 && element) {
      candidates = ctx.nodes.filter((n) => n.element.tagName.toLowerCase() === element)
    }
    if (candidates.length === 0) return { reason: `no node under component ${component ?? element ?? '?'}` }

    const rect = descriptor.visual?.rect
    let best: IndexedNode | undefined
    let bestScore = 0
    for (const node of candidates) {
      const score = matchSemanticPath(target, node.semantic())
      if (score > bestScore) {
        best = node
        bestScore = score
      } else if (score === bestScore && best && rect) {
        // Equal paths mean repeated instances; fall back to where the comment sat.
        if (centerDistance(node.rect, rect) < centerDistance(best.rect, rect)) best = node
      }
    }

    if (!best || bestScore === 0) return { reason: 'semantic path did not align' }
    return {
      match: { node: best, confidence: round(bestScore), reason: `semantic path score ${round(bestScore)}` },
      reason: 'matched',
    }
  },
}
