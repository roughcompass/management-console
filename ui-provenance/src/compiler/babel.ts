import { relative, sep } from 'node:path'
import { ATTR } from '../core/attributes.js'
import type { SaltCatalog } from '../core/types.js'
import type { SourceElement } from './ast.js'
import { decideInjection } from './transform.js'

/** Minimal structural view of the babel API this plugin uses. */
interface BabelTypes {
  jsxAttribute(name: unknown, value: unknown): unknown
  jsxIdentifier(name: string): unknown
  stringLiteral(value: string): unknown
}

interface OpeningElementNode {
  name?: { type: string }
  attributes?: Array<{ type: string; name?: { name?: string } }>
  loc?: unknown
}

interface BabelPath {
  node: OpeningElementNode
}

interface PluginPass {
  filename?: string
  file?: { opts?: { filename?: string } }
}

export interface BabelInjectorSource {
  elementsFor(file: string): readonly SourceElement[]
  idsFor(file: string): Map<number, string>
  catalog?: SaltCatalog
  /** False in a production build: the pass then only strips. */
  enabled?: boolean
}

/** Authored provenance attributes. Useful in a preview, out of place in prod. */
const AUTHORED_ATTRIBUTES = new Set<string>([ATTR.explicitKey, ATTR.instanceKey])

/**
 * The same injection, expressed as a babel plugin so it can ride the host
 * build's existing JSX pass.
 *
 * Regenerating whole modules from our own parse works, but it hands other
 * plugins a module they did not produce - which is how the federation plugin
 * came to mistake an ordinary component for an application entry. Riding the
 * existing pass changes only the attribute list.
 */
export function createInjectorBabelPlugin(source: BabelInjectorSource, root: string) {
  return function uiProvenanceBabel(babel: { types: BabelTypes }) {
    const t = babel.types
    let elements: readonly SourceElement[] = []
    let ids = new Map<number, string>()
    let index = 0

    return {
      name: 'de-ui-provenance',
      pre(this: PluginPass, state: { opts?: { filename?: string } }) {
        const filename = (this as PluginPass).filename ?? state?.opts?.filename
        const file = filename ? relative(root, filename).split(sep).join('/') : ''
        elements = source.elementsFor(file)
        ids = source.idsFor(file)
        index = 0
      },
      visitor: {
        JSXOpeningElement(path: BabelPath) {
          const node = path.node
          if (!node.name || !node.loc) return

          // Production keeps neither the generated id nor the authored keys:
          // an artifact should carry no trace that the loop exists.
          if (source.enabled === false) {
            const attributes = node.attributes
            if (!attributes) return
            for (let position = attributes.length - 1; position >= 0; position--) {
              const attribute = attributes[position]!
              const name = attribute.name?.name
              if (
                attribute.type === 'JSXAttribute' &&
                name &&
                (name === ATTR.sourceId || AUTHORED_ATTRIBUTES.has(name))
              ) {
                attributes.splice(position, 1)
              }
            }
            return
          }

          // Counted in the same order the analyser walked, so index N here is
          // source element N there.
          const current = index++
          const element = elements[current]
          const sourceId = ids.get(current)
          if (!element || !sourceId) return
          if (!decideInjection(element, source.catalog).inject) return

          const attributes = node.attributes
          if (!attributes) return
          const already = attributes.some(
            (attribute) =>
              attribute.type === 'JSXAttribute' && attribute.name?.name === ATTR.sourceId,
          )
          if (already) return
          attributes.push(
            t.jsxAttribute(t.jsxIdentifier(ATTR.sourceId), t.stringLiteral(sourceId)) as never,
          )
        },
      },
    }
  }
}
