import type { Strategy } from './types.js'
import { intersectionOverUnion, round } from './types.js'

import type { AnchorDescriptor } from '../types.js'

const VIEWPORT_TOLERANCE = 0.05

function expectedTagOf(descriptor: AnchorDescriptor): string | undefined {
  const tail = descriptor.semantic?.segments.at(-1)
  if (tail?.kind === 'element') return tail.name
  return descriptor.text?.tag ?? descriptor.provenance?.element
}

/**
 * Level 5, last resort. Only valid under the same theme and a near-identical
 * viewport: a box on a 1440px desktop render says nothing about where the same
 * node sits at 768px. Refusing to match here is correct - a wrong anchor is
 * worse than a flagged orphan.
 */
export const visualStrategy: Strategy = {
  level: 'visual',
  floor: 0.4,
  clean: 0.5,
  run(descriptor, ctx) {
    const anchor = descriptor.visual
    if (!anchor) return { reason: 'no visual anchor captured' }
    if (anchor.theme !== ctx.theme) {
      return { reason: `theme changed (${anchor.theme} -> ${ctx.theme})` }
    }
    const widthDelta = Math.abs(anchor.viewport.width - ctx.viewport.width) / Math.max(1, anchor.viewport.width)
    const heightDelta = Math.abs(anchor.viewport.height - ctx.viewport.height) / Math.max(1, anchor.viewport.height)
    if (widthDelta > VIEWPORT_TOLERANCE || heightDelta > VIEWPORT_TOLERANCE) {
      return { reason: `viewport changed (${anchor.viewport.width}x${anchor.viewport.height} -> ${ctx.viewport.width}x${ctx.viewport.height})` }
    }
    if (anchor.rect.width === 0 || anchor.rect.height === 0) {
      return { reason: 'captured rect has no area' }
    }

    // A box on its own matches whatever happens to sit in that region now. The
    // tag is the one cheap constraint left at this level, and without it the
    // last resort produces confident nonsense.
    const expectedTag = expectedTagOf(descriptor)
    const candidates = expectedTag
      ? ctx.nodes.filter((node) => node.element.tagName.toLowerCase() === expectedTag)
      : ctx.nodes
    if (candidates.length === 0) return { reason: `no <${expectedTag}> in this build` }

    let best: (typeof ctx.nodes)[number] | undefined
    let bestIou = 0
    for (const node of candidates) {
      const iou = intersectionOverUnion(anchor.rect, node.rect)
      if (iou > bestIou) {
        best = node
        bestIou = iou
      }
    }
    if (!best || bestIou < 0.5) return { reason: `best box overlap ${round(bestIou)} below 0.5` }
    return {
      match: { node: best, confidence: round(0.3 + 0.3 * bestIou), reason: `box overlap ${round(bestIou)}` },
      reason: 'matched',
    }
  },
}
