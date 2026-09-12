import type { ResolutionContext } from './index-dom.js'
import { normalizeText, ownText, rectOf, readTokens } from './index-dom.js'
import { buildSemanticPath } from './semantic-path.js'
import type {
  AnchorDescriptor,
  AnchorLevel,
  AnchorType,
  Layer,
  NonVisualTarget,
  SemanticPath,
  TokenRef,
} from './types.js'

export interface CaptureOptions {
  /** Screenshot crop supplied by the preview host, when it can produce one. */
  crop?: string
  layerHint?: Layer
  now?: () => string
}

function computedValues(element: Element, tokens: TokenRef[]): TokenRef[] {
  const view = element.ownerDocument?.defaultView
  if (!view?.getComputedStyle) return tokens
  let style: CSSStyleDeclaration
  try {
    style = view.getComputedStyle(element)
  } catch {
    return tokens
  }
  return tokens.map((token) =>
    token.property ? { ...token, value: style.getPropertyValue(token.property) || undefined } : token,
  )
}

function highestLevel(
  hasProvenance: boolean,
  semantic: SemanticPath,
  tokens: TokenRef[],
  hasText: boolean,
): AnchorLevel {
  if (hasProvenance) return 'provenance'
  // A path of nothing but the element tag carries no more signal than the tag.
  if (semantic.segments.some((s) => s.kind !== 'element')) return 'semantic'
  if (tokens.length > 0) return 'token'
  if (hasText) return 'text'
  return 'visual'
}

/**
 * Capture every level of the chain at once. Storing all five is the whole
 * point: the specific levels are what make re-anchoring accurate, and the
 * loose levels are what stop a comment from orphaning when the specific ones
 * are refactored away.
 */
export function captureAnchor(
  element: Element,
  ctx: ResolutionContext,
  options: CaptureOptions = {},
): AnchorDescriptor {
  const now = options.now ?? (() => new Date().toISOString())
  const indexed = ctx.nodeFor(element)

  const semantic = indexed ? indexed.semantic() : buildSemanticPath(element, ctx.manifest, ctx.root)
  const tokens = computedValues(element, indexed?.tokens ?? readTokens(element))
  const own = indexed?.text?.text ?? ownText(element)
  const text = own
    ? {
        text: own,
        normalized: normalizeText(own),
        ordinal: indexed?.text?.ordinal ?? 0,
        tag: element.tagName.toLowerCase(),
      }
    : undefined

  const descriptor: AnchorDescriptor = {
    anchorType: 'visual-node',
    capturedAt: now(),
    capturedLevel: highestLevel(Boolean(indexed?.provenance), semantic, tokens, Boolean(text)),
    contextLockId: ctx.lock.id,
    provenance: indexed?.provenance,
    semantic,
    tokens: tokens.length ? tokens : undefined,
    text,
    visual: {
      rect: indexed?.rect ?? rectOf(element),
      viewport: ctx.viewport,
      theme: ctx.theme,
      devicePixelRatio: ctx.devicePixelRatio,
      crop: options.crop,
    },
  }
  return descriptor
}

const TARGET_ANCHOR_TYPE: Record<NonVisualTarget['kind'], AnchorType> = {
  network: 'network-interaction',
  'runtime-event': 'runtime-event',
  'build-artifact': 'build-artifact',
  'source-symbol': 'source-symbol',
  general: 'general',
}

/**
 * Developer feedback targets things that are not on screen. It travels through
 * the same thread and (in later phases) change-intent machinery; only the
 * anchor payload differs.
 */
export function captureNonVisualAnchor(
  target: NonVisualTarget,
  ctx: ResolutionContext,
  options: CaptureOptions = {},
): AnchorDescriptor {
  const now = options.now ?? (() => new Date().toISOString())
  return {
    anchorType: TARGET_ANCHOR_TYPE[target.kind],
    capturedAt: now(),
    // Non-visual anchors identify themselves; they never fall down the chain.
    capturedLevel: 'provenance',
    contextLockId: ctx.lock.id,
    target,
  }
}
