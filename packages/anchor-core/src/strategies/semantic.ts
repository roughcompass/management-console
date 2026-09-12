import type { IndexedNode } from '../index-dom.js'
import { matchSemanticPath } from '../semantic-path.js'
import type { AnchorDescriptor, SemanticPath } from '../types.js'
import type { Strategy } from './types.js'
import { centerDistance, round } from './types.js'

/**
 * A path locates a region, not always a node: two sibling divs inside one
 * component share a path exactly. Text and token bindings are the identity the
 * node carries itself, so a candidate that contradicts them is discounted hard
 * enough that a full-path match lands as degraded rather than resolved, and a
 * partial one stops clearing the floor at all.
 */
const CONTRADICTION_PENALTY = 0.6

function corroboration(descriptor: AnchorDescriptor, node: IndexedNode): number {
  const text = descriptor.text?.normalized
  if (text && node.text?.normalized !== text) return CONTRADICTION_PENALTY

  const tokens = descriptor.tokens ?? []
  if (tokens.length > 0) {
    const bound = new Set(node.tokens.map((token) => token.token))
    if (!tokens.some((token) => bound.has(token.token))) return CONTRADICTION_PENALTY
  }
  return 1
}

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

    // Candidates are chosen by tag, not by provenance: a node rendered by a
    // design-system component carries no provenance of its own, but its path
    // still runs through the application component that placed it. Filtering by
    // the provenance index would make every such node unaddressable.
    let candidates: IndexedNode[] = element
      ? ctx.nodes.filter((node) => node.element.tagName.toLowerCase() === element)
      : (component ? (ctx.byComponent.get(component) ?? []) : [])
    if (candidates.length === 0 && component) candidates = ctx.byComponent.get(component) ?? []
    if (candidates.length === 0) {
      return { reason: `nothing under ${component ?? element ?? '?'} in this build` }
    }

    const rect = descriptor.visual?.rect
    let best: IndexedNode | undefined
    let bestScore = 0
    let contradicted = false

    for (const node of candidates) {
      const penalty = corroboration(descriptor, node)
      const score = round(matchSemanticPath(target, node.semantic()) * penalty)
      if (score > bestScore) {
        best = node
        bestScore = score
        contradicted = penalty < 1
      } else if (score === bestScore && best && rect) {
        // Equal paths mean repeated instances; fall back to where the comment sat.
        if (centerDistance(node.rect, rect) < centerDistance(best.rect, rect)) {
          best = node
          contradicted = penalty < 1
        }
      }
    }

    if (!best || bestScore === 0) return { reason: 'semantic path did not align' }
    const reason = contradicted
      ? `semantic path score ${bestScore}, but its text or tokens changed`
      : `semantic path score ${bestScore}`
    return { match: { node: best, confidence: bestScore, reason }, reason: 'matched' }
  },
}
