import type { ResolutionContext } from './index-dom.js'
import { normalizeText, ownText, rectOf, readTokens } from './index-dom.js'
import { buildSemanticPath } from './semantic-path.js'
import type {
  AnchorDescriptor,
  AnchorDisplay,
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

const NAME_LIMIT = 40
const HEADING = 'h1,h2,h3,h4,h5,h6,[role="heading"],[class*="saltText-h"]'
const SECTION = '[data-mfe],[data-zone],section,article,main,[role="region"]'

/**
 * The text a person sees on the node: text nodes only, skipping icons and
 * anything hidden from assistive technology, whitespace collapsed.
 */
/**
 * A label is only useful if it is the text the reviewer can see, so the cased
 * form on screen wins over the cased form in the markup: a status rendered
 * `text-transform: capitalize` reads "Failed" even though the DOM says
 * "failed", and that is what she will call it.
 */
function transformed(text: string, element: Element | null): string {
  const view = element?.ownerDocument?.defaultView
  if (!view?.getComputedStyle) return text
  let transform: string
  try {
    transform = view.getComputedStyle(element!).textTransform
  } catch {
    return text
  }
  switch (transform) {
    case 'uppercase':
      return text.toUpperCase()
    case 'lowercase':
      return text.toLowerCase()
    case 'capitalize':
      return text.replace(/(^|\s)(\p{L})/gu, (_, lead: string, first: string) => lead + first.toUpperCase())
    default:
      return text
  }
}

export function visibleText(element: Element): string {
  const doc = element.ownerDocument
  if (!doc) return ''
  const walker = doc.createTreeWalker(element, 4 /* NodeFilter.SHOW_TEXT */)
  let out = ''
  let lastParent: Node | null = null
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    let skip = false
    for (let up = node.parentElement; up && up !== element.parentElement; up = up.parentElement) {
      if (up.namespaceURI === 'http://www.w3.org/2000/svg' || up.getAttribute('aria-hidden') === 'true') {
        skip = true
        break
      }
    }
    if (skip || !node.textContent) continue
    // Adjacent text nodes in one element are one run ("88" + "%"); text from
    // different elements is separated, the way it reads on the page.
    if (out && node.parentNode !== lastParent) out += ' '
    out += transformed(node.textContent, node.parentElement)
    lastParent = node.parentNode
  }
  return out.replace(/\s+/g, ' ').trim()
}

function regionOf(element: Element, root: Element | Document | undefined): string | undefined {
  for (let up = element.parentElement; up && up !== root; up = up.parentElement) {
    if (!up.matches(SECTION)) continue
    const heading = up.querySelector(HEADING)
    if (heading && !element.contains(heading)) {
      const text = visibleText(heading)
      if (text) return text.slice(0, 60)
    }
  }
  return undefined
}

function captureDisplay(
  element: Element,
  root: Element | Document | undefined,
  semantic: SemanticPath,
  component: string | undefined,
): AnchorDisplay {
  const fromPath = [...semantic.segments].reverse().find((s) => s.kind === 'component')?.name
  const text = visibleText(element)
  return {
    component: component ?? fromPath,
    text: text && text.length <= NAME_LIMIT ? text : undefined,
    region: regionOf(element, root),
  }
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
    display: captureDisplay(element, ctx.root, semantic, indexed?.provenance?.component),
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
