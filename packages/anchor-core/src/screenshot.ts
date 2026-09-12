/**
 * Best-effort image of what the reviewer was looking at when they commented.
 *
 * This is triage evidence, never matching input: when an anchor orphans, the
 * thread can still show the thing the comment was about. Nothing in the
 * resolution chain reads it.
 *
 * It renders a style-inlined clone through an SVG foreignObject, so it needs no
 * dependency and no server. The known limits are real and acceptable for that
 * purpose: cross-origin images taint the canvas, and web fonts do not load
 * inside the SVG. Both failure modes return undefined rather than throw.
 */

const INLINED_PROPERTIES = [
  'align-items',
  'background-color',
  'background-image',
  'border',
  'border-radius',
  'box-shadow',
  'box-sizing',
  'color',
  'display',
  'flex',
  'flex-direction',
  'font-family',
  'font-size',
  'font-style',
  'font-variant-numeric',
  'font-weight',
  'gap',
  'height',
  'justify-content',
  'letter-spacing',
  'line-height',
  'list-style',
  'margin',
  'opacity',
  'overflow',
  'padding',
  'text-align',
  'text-decoration',
  'text-transform',
  'vertical-align',
  'white-space',
  'width',
] as const

const DROPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'NOSCRIPT'])

export interface ScreenshotOptions {
  /** Longest edge of the produced image. Crops are thumbnails, not evidence photos. */
  maxEdge?: number
  /** Painted behind the clone. Defaults to the first opaque ancestor background. */
  background?: string
  /** Escape hatch for hosts that already have a screenshot service. */
  capture?: (element: Element) => Promise<string | undefined>
}

const TRANSPARENT = /^(transparent|rgba\(0,\s*0,\s*0,\s*0\))$/

/**
 * An element's own background is usually transparent, and a fixed white default
 * renders a dark theme as white text on white. Walk up for the first painted
 * background instead.
 */
function resolveBackground(element: Element): string {
  const view = element.ownerDocument?.defaultView
  if (!view?.getComputedStyle) return '#ffffff'
  let node: Element | null = element
  while (node) {
    const value = view.getComputedStyle(node).backgroundColor
    if (value && !TRANSPARENT.test(value.replace(/\s+/g, ' ').trim())) return value
    node = node.parentElement
  }
  return '#ffffff'
}

function inlineStyles(source: Element, clone: Element): void {
  const view = source.ownerDocument?.defaultView
  if (!view?.getComputedStyle) return
  const computed = view.getComputedStyle(source)
  let css = ''
  for (const property of INLINED_PROPERTIES) {
    const value = computed.getPropertyValue(property)
    if (value) css += `${property}:${value};`
  }
  clone.setAttribute('style', css)
}

function cloneWithStyles(element: Element): Element | undefined {
  const clone = element.cloneNode(true) as Element
  const sources = [element, ...Array.from(element.querySelectorAll('*'))]
  const clones = [clone, ...Array.from(clone.querySelectorAll('*'))]
  if (sources.length !== clones.length) return undefined

  for (let i = 0; i < sources.length; i++) {
    const target = clones[i]!
    if (DROPPED_TAGS.has(target.tagName)) {
      target.remove()
      continue
    }
    inlineStyles(sources[i]!, target)
  }
  return clone
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('crop render failed'))
    image.src = source
  })
}

export async function captureElementImage(
  element: Element,
  options: ScreenshotOptions = {},
): Promise<string | undefined> {
  if (options.capture) {
    try {
      return await options.capture(element)
    } catch {
      return undefined
    }
  }

  try {
    const doc = element.ownerDocument
    const view = doc?.defaultView
    if (!doc || !view) return undefined

    const box = element.getBoundingClientRect()
    const width = Math.ceil(box.width)
    const height = Math.ceil(box.height)
    if (width === 0 || height === 0) return undefined

    const clone = cloneWithStyles(element)
    if (!clone) return undefined

    const serialized = new XMLSerializer().serializeToString(clone)
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml">${serialized}</div>` +
      `</foreignObject></svg>`

    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)

    const maxEdge = options.maxEdge ?? 480
    const scale = Math.min(1, maxEdge / Math.max(width, height))
    const canvas = doc.createElement('canvas')
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d')
    if (!context) return undefined

    context.fillStyle = options.background ?? resolveBackground(element)
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    return canvas.toDataURL('image/png')
  } catch {
    // A crop is a nicety. Losing it must never cost the comment.
    return undefined
  }
}
