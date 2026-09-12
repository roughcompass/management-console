import { lookupFile, lookupNode, lookupScope, provAttr } from './manifest.js'
import { buildSemanticPath } from './semantic-path.js'
import type {
  ContextLock,
  ProvenanceManifest,
  ProvenanceRef,
  Rect,
  SemanticPath,
  TextAnchor,
  TokenRef,
} from './types.js'
import { ATTR } from './types.js'

const SKIPPED_TAGS = new Set(['script', 'style', 'link', 'meta', 'head', 'title', 'br'])
/** Attribute the feedback overlay marks its own DOM with, so it never self-anchors. */
export const OVERLAY_ATTR = 'data-adl-overlay'

export interface IndexedNode {
  element: Element
  provRaw?: string
  provenance?: ProvenanceRef
  tokens: TokenRef[]
  text?: TextAnchor
  rect: Rect
  /** Memoised: building every path eagerly is wasted work on a large preview. */
  semantic(): SemanticPath
}

export interface ResolutionContextOptions {
  root?: Element | Document
  manifest?: ProvenanceManifest
  lock: ContextLock
  theme?: string
  viewport?: { width: number; height: number }
  devicePixelRatio?: number
  /** Guard against pathological DOM sizes in a shared preview host. */
  maxNodes?: number
}

export interface ResolutionContext {
  root: Element | Document
  manifest?: ProvenanceManifest
  lock: ContextLock
  theme: string
  viewport: { width: number; height: number }
  devicePixelRatio: number
  nodes: IndexedNode[]
  byProvToken: Map<string, IndexedNode[]>
  byComponent: Map<string, IndexedNode[]>
  byNormalizedText: Map<string, IndexedNode[]>
  byDesignToken: Map<string, IndexedNode[]>
  nodeFor(element: Element): IndexedNode | undefined
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Text contributed by this element's own text nodes, not by its descendants. */
export function ownText(element: Element): string {
  let out = ''
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) out += child.nodeValue ?? ''
  }
  return out.trim()
}

export function readTokens(element: Element): TokenRef[] {
  const raw = element.getAttribute(ATTR.tokens)
  if (!raw) return []
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry) => {
      // "color.action.primary.bg=background-color" binds a token to a property.
      const [token, property] = entry.split('=')
      return { token: token!.trim(), property: property?.trim() }
    })
}

export function rectOf(element: Element): Rect {
  const box = element.getBoundingClientRect?.()
  if (!box) return { x: 0, y: 0, width: 0, height: 0 }
  const view = element.ownerDocument?.defaultView
  const scrollX = view?.scrollX ?? 0
  const scrollY = view?.scrollY ?? 0
  return {
    x: Math.round(box.left + scrollX),
    y: Math.round(box.top + scrollY),
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

export function readProvenance(
  element: Element,
  manifest: ProvenanceManifest | undefined,
  ordinal: number,
): ProvenanceRef | undefined {
  const raw = provAttr(element)
  if (!raw) return undefined
  const node = lookupNode(manifest, raw)
  // The source id is the key; the module it belongs to comes from the entry.
  const file = node ? lookupFile(manifest, node.module) : undefined
  const scope = node ? lookupScope(manifest, node.module) : undefined
  if (!node || !file || !scope || !manifest) return undefined
  return {
    token: raw,
    scope: scope.name,
    repo: scope.entry.repo,
    commit: scope.entry.commit,
    file,
    line: node.line,
    column: node.column,
    component: node.component,
    element: node.element,
    instanceKey: element.getAttribute(ATTR.provKey) ?? undefined,
    ordinal,
  }
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const bucket = map.get(key)
  if (bucket) bucket.push(value)
  else map.set(key, [value])
}

/**
 * One pass over the preview DOM per rebuild. Every anchor in the revision set
 * then resolves against this index instead of re-querying the document, which
 * is what makes a full re-anchor pass affordable on every rebuild.
 */
export function createResolutionContext(options: ResolutionContextOptions): ResolutionContext {
  const root = options.root ?? (typeof document !== 'undefined' ? document : undefined)
  if (!root) throw new Error('createResolutionContext requires a root element or a document')

  const view = root instanceof Element ? root.ownerDocument?.defaultView : (root as Document).defaultView
  const viewport = options.viewport ?? {
    width: view?.innerWidth ?? 0,
    height: view?.innerHeight ?? 0,
  }
  const themeHost = root instanceof Element ? root : (root as Document).documentElement
  const theme = options.theme ?? themeHost?.getAttribute(ATTR.theme) ?? 'default'
  const maxNodes = options.maxNodes ?? 10_000

  const nodes: IndexedNode[] = []
  const byProvToken = new Map<string, IndexedNode[]>()
  const byComponent = new Map<string, IndexedNode[]>()
  const byNormalizedText = new Map<string, IndexedNode[]>()
  const byDesignToken = new Map<string, IndexedNode[]>()
  const byElement = new Map<Element, IndexedNode>()

  const provOrdinals = new Map<string, number>()
  const textOrdinals = new Map<string, number>()

  const walk = (element: Element): void => {
    if (nodes.length >= maxNodes) return
    const tag = element.tagName.toLowerCase()
    if (SKIPPED_TAGS.has(tag)) return
    if (element.hasAttribute(OVERLAY_ATTR)) return

    const raw = provAttr(element) ?? undefined
    let provenance: ProvenanceRef | undefined
    if (raw) {
      const ordinal = provOrdinals.get(raw) ?? 0
      provOrdinals.set(raw, ordinal + 1)
      provenance = readProvenance(element, options.manifest, ordinal)
    }

    const own = ownText(element)
    let text: TextAnchor | undefined
    if (own) {
      const normalized = normalizeText(own)
      const ordinal = textOrdinals.get(normalized) ?? 0
      textOrdinals.set(normalized, ordinal + 1)
      text = { text: own, normalized, ordinal, tag }
    }

    let semanticCache: SemanticPath | undefined
    const node: IndexedNode = {
      element,
      provRaw: raw,
      provenance,
      tokens: readTokens(element),
      text,
      rect: rectOf(element),
      semantic() {
        semanticCache ??= buildSemanticPath(element, options.manifest, root)
        return semanticCache
      },
    }

    nodes.push(node)
    byElement.set(element, node)
    if (raw) push(byProvToken, raw, node)
    if (provenance?.component) push(byComponent, provenance.component, node)
    if (text) push(byNormalizedText, text.normalized, node)
    for (const token of node.tokens) push(byDesignToken, token.token, node)

    for (const child of Array.from(element.children)) walk(child)
  }

  const start = root instanceof Element ? [root] : Array.from((root as Document).body?.children ?? [])
  for (const element of start) walk(element)

  return {
    root,
    manifest: options.manifest,
    lock: options.lock,
    theme,
    viewport,
    devicePixelRatio: options.devicePixelRatio ?? view?.devicePixelRatio ?? 1,
    nodes,
    byProvToken,
    byComponent,
    byNormalizedText,
    byDesignToken,
    nodeFor: (element: Element) => byElement.get(element),
  }
}
