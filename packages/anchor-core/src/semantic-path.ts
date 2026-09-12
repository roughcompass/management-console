import { lookupNode, provAttr } from './manifest.js'
import type { ProvenanceManifest, SemanticPath, SemanticSegment } from './types.js'
import { ATTR } from './types.js'

/**
 * Builds "Frame > Zone[main] > MFE[payments-dash]@2.4.1 > PositionsTable >
 * StatusBadge" by walking from the root down to the element. Frame, zone and
 * MFE segments come from the host contract; component segments come from the
 * build manifest. Consecutive repeats of the same component collapse, so DOM
 * churn inside a component does not lengthen the path.
 */
export function buildSemanticPath(
  element: Element,
  manifest?: ProvenanceManifest,
  root?: Element | Document,
): SemanticPath {
  const stopAt = root instanceof Element ? root : undefined
  const chain: Element[] = []
  let node: Element | null = element
  while (node) {
    chain.unshift(node)
    if (node === stopAt) break
    node = node.parentElement
  }

  const collected: Array<{ segment: SemanticSegment; depth: number }> = []
  let lastBoundaryDepth = -1

  chain.forEach((el, depth) => {
    const frame = el.getAttribute(ATTR.frame)
    if (frame !== null) {
      collected.push({
        segment: { kind: 'frame', name: frame, version: el.getAttribute(ATTR.frameVersion) ?? undefined },
        depth,
      })
      lastBoundaryDepth = depth
    }
    const zone = el.getAttribute(ATTR.zone)
    if (zone !== null) {
      collected.push({ segment: { kind: 'zone', name: zone }, depth })
      lastBoundaryDepth = depth
    }
    const mfe = el.getAttribute(ATTR.mfe)
    if (mfe !== null) {
      collected.push({
        segment: { kind: 'mfe', name: mfe, version: el.getAttribute(ATTR.mfeVersion) ?? undefined },
        depth,
      })
      lastBoundaryDepth = depth
    }
    const raw = provAttr(el)
    const entry = raw ? lookupNode(manifest, raw) : undefined
    if (entry?.component) {
      collected.push({ segment: { kind: 'component', name: entry.component }, depth })
    }
  })

  // Components above the innermost host boundary are shell plumbing: the Frame
  // that renders the zone, the app that renders the Frame. The addressable
  // path starts at the boundary, which is also what the host contract owns.
  const segments: SemanticSegment[] = []
  for (const { segment, depth } of collected) {
    if (segment.kind === 'component' && depth < lastBoundaryDepth) continue
    const last = segments[segments.length - 1]
    if (last && last.kind === segment.kind && last.name === segment.name) continue
    segments.push(segment)
  }

  segments.push({ kind: 'element', name: element.tagName.toLowerCase() })
  return { segments }
}

export interface FormatOptions {
  includeElement?: boolean
}

export function formatSemanticPath(path: SemanticPath, options: FormatOptions = {}): string {
  const includeElement = options.includeElement ?? true
  return path.segments
    .filter((s) => includeElement || s.kind !== 'element')
    .map(formatSegment)
    .join(' > ')
}

function formatSegment(segment: SemanticSegment): string {
  const version = segment.version ? `@${segment.version}` : ''
  switch (segment.kind) {
    case 'frame':
      return segment.name ? `Frame[${segment.name}]${version}` : `Frame${version}`
    case 'zone':
      return `Zone[${segment.name}]`
    case 'mfe':
      return `MFE[${segment.name}]${version}`
    default:
      return segment.name
  }
}

const SEGMENT_RE = /^(Frame|Zone|MFE)(?:\[([^\]]*)\])?(?:@(.+))?$/

export function parseSemanticPath(text: string): SemanticPath {
  const segments = text
    .split('>')
    .map((part) => part.trim())
    .filter(Boolean)
    .map<SemanticSegment>((part, index, all) => {
      const match = SEGMENT_RE.exec(part)
      if (match) {
        const [, kind, name, version] = match
        return {
          kind: kind === 'Frame' ? 'frame' : kind === 'Zone' ? 'zone' : 'mfe',
          name: name ?? '',
          version,
        }
      }
      // Lowercase tail segment is a DOM tag; anything else is a component.
      const isTail = index === all.length - 1
      const isTag = isTail && part === part.toLowerCase()
      return { kind: isTag ? 'element' : 'component', name: part }
    })
  return { segments }
}

/**
 * Score how well a candidate path satisfies a target path, comparing from the
 * tail so that an MFE remounted under a different zone still matches on the
 * component tail. An MFE version bump costs confidence but is not a miss:
 * surviving version churn is the point of this level.
 */
export function matchSemanticPath(target: SemanticPath, candidate: SemanticPath): number {
  let i = target.segments.length - 1
  let j = candidate.segments.length - 1
  let matched = 0
  let penalty = 1

  while (i >= 0 && j >= 0) {
    const score = segmentScore(target.segments[i]!, candidate.segments[j]!)
    if (score === 0) break
    penalty *= score
    matched += 1
    i -= 1
    j -= 1
  }

  if (matched === 0) return 0
  const coverage = matched / target.segments.length
  return round(penalty * (0.4 + 0.6 * coverage))
}

function segmentScore(target: SemanticSegment, candidate: SemanticSegment): number {
  if (target.kind !== candidate.kind) return 0
  if (target.name !== candidate.name) return 0
  if (target.kind === 'mfe' || target.kind === 'frame') {
    if (target.version && candidate.version && target.version !== candidate.version) return 0.9
  }
  return 1
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000
}
