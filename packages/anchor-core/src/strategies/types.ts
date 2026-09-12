import type { IndexedNode, ResolutionContext } from '../index-dom.js'
import type { AnchorDescriptor, AnchorLevel, Rect } from '../types.js'

export interface StrategyMatch {
  node: IndexedNode
  confidence: number
  reason: string
}

export interface StrategyResult {
  match?: StrategyMatch
  /** Always populated, so an orphan report says what was tried and why it failed. */
  reason: string
}

export interface Strategy {
  level: AnchorLevel
  /** Below this, a match is noise and is discarded. */
  floor: number
  /** At or above this, a match at this level is as good as the level gets. */
  clean: number
  run(descriptor: AnchorDescriptor, ctx: ResolutionContext): StrategyResult
}

export function centerDistance(a: Rect, b: Rect): number {
  const ax = a.x + a.width / 2
  const ay = a.y + a.height / 2
  const bx = b.x + b.width / 2
  const by = b.y + b.height / 2
  return Math.hypot(ax - bx, ay - by)
}

export function intersectionOverUnion(a: Rect, b: Rect): number {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x))
  const y = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  const overlap = x * y
  const union = a.width * a.height + b.width * b.height - overlap
  return union <= 0 ? 0 : overlap / union
}

/** Nearest candidate to where the comment was left. Used only to break ties. */
export function nearest(nodes: IndexedNode[], rect: Rect | undefined): IndexedNode {
  if (!rect || nodes.length === 1) return nodes[0]!
  return nodes.reduce((best, node) =>
    centerDistance(node.rect, rect) < centerDistance(best.rect, rect) ? node : best,
  )
}

export function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
