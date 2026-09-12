import { ATTR } from '../core/attributes.js'

/**
 * Ancestors, crossing open shadow boundaries through the host. This is the
 * programmatic equivalent of composedPath() for a selection made without an
 * event, and it is why a Salt dialog rendered through a portal still resolves.
 */
export function composedAncestors(element: Element): Element[] {
  const chain: Element[] = []
  let current: Element | null = element
  while (current) {
    chain.push(current)
    const parent: Element | null = current.parentElement
    if (parent) {
      current = parent
      continue
    }
    const root = current.getRootNode()
    current = root instanceof ShadowRoot ? root.host : null
  }
  return chain
}

export function nearestWithAttribute(element: Element, attribute: string): Element | undefined {
  return composedAncestors(element).find((candidate) => candidate.hasAttribute(attribute))
}

/** elementFromPoint does not pierce shadow roots, so descend explicitly. */
export function deepElementFromPoint(x: number, y: number): Element | null {
  let element = document.elementFromPoint(x, y)
  while (element?.shadowRoot) {
    const inner = element.shadowRoot.elementFromPoint(x, y)
    if (!inner || inner === element) break
    element = inner
  }
  return element
}

export interface BoundaryCheck {
  unsupported: boolean
  reason?: string
}

/**
 * Two boundaries this phase cannot see through. A closed shadow root cannot be
 * detected directly, so a custom element that exposes no open root is treated
 * as one: reporting an unsupported boundary is correct, and guessing at the
 * host element would attach feedback to the wrong thing.
 */
export function checkBoundary(element: Element): BoundaryCheck {
  if (element.tagName === 'IFRAME') {
    return { unsupported: true, reason: 'element is an iframe; its document is out of reach' }
  }
  const isCustomElement = element.tagName.includes('-')
  if (isCustomElement && !element.shadowRoot && element.childElementCount === 0) {
    return { unsupported: true, reason: 'custom element exposes no open shadow root' }
  }
  return { unsupported: false }
}

/**
 * CSS.escape is missing in some non-browser DOM implementations, and identity
 * lookups must not depend on it. Source ids never need escaping; authored
 * instance keys can.
 */
export function cssEscape(value: string): string {
  const native = (globalThis as { CSS?: { escape?(value: string): string } }).CSS?.escape
  if (native) return native(value)
  return value.replace(/["'\\\]\[]/g, (character) => `\\${character}`)
}

export function instanceKeyOf(element: Element): string | undefined {
  const found = nearestWithAttribute(element, ATTR.instanceKey)
  return found?.getAttribute(ATTR.instanceKey) ?? undefined
}

export function accessibleRoleOf(element: Element): string | undefined {
  const explicit = element.getAttribute('role')
  if (explicit) return explicit
  const implicitRoles: Record<string, string> = {
    A: 'link',
    BUTTON: 'button',
    INPUT: 'textbox',
    TABLE: 'table',
    TR: 'row',
    TD: 'cell',
    TH: 'columnheader',
    UL: 'list',
    LI: 'listitem',
    NAV: 'navigation',
    MAIN: 'main',
    HEADER: 'banner',
    IMG: 'img',
  }
  return implicitRoles[element.tagName]
}

export function accessibleNameOf(element: Element): string {
  return (
    element.getAttribute('aria-label') ??
    element.getAttribute('title') ??
    element.getAttribute('alt') ??
    element.textContent ??
    ''
  )
}

/** Tag path plus sibling position: enough to tell two lists apart, cheap to compute. */
export function domShapeOf(element: Element): string {
  return composedAncestors(element)
    .slice(0, 6)
    .map((node) => {
      const parent = node.parentElement
      const index = parent ? [...parent.children].indexOf(node) : 0
      return `${node.tagName.toLowerCase()}:${index}`
    })
    .reverse()
    .join('/')
}
