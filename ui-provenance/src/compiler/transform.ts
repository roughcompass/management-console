import _generate from '@babel/generator'
import _traverse from '@babel/traverse'
import * as t from '@babel/types'
import { ATTR } from '../core/attributes.js'
import type { SaltCatalog } from '../core/types.js'
import { elementName, parseSource } from './ast.js'
import type { SourceElement } from './ast.js'
import { injectionNote, lookupCatalog, mayInject } from './salt.js'

const traverse = ((_traverse as unknown as { default?: typeof _traverse }).default ??
  _traverse) as typeof _traverse
const generate = ((_generate as unknown as { default?: typeof _generate }).default ??
  _generate) as typeof _generate

export interface InjectionRecord {
  index: number
  sourceId: string
  instrumented: boolean
  note?: string
}

export interface InstrumentOptions {
  code: string
  file: string
  elements: readonly SourceElement[]
  /** sourceId per element index, from the registry. */
  ids: ReadonlyMap<number, string>
  catalog?: SaltCatalog
  sourceMaps?: boolean
}

export interface InstrumentResult {
  code: string
  map?: unknown
  injections: InjectionRecord[]
}

export interface InjectionDecision {
  inject: boolean
  note?: string
}

/**
 * Whether this element can carry the attribute, and why not when it cannot.
 * Shared with the manifest builder so the manifest describes the build's
 * intent for every element, not only for the modules a dev server has served.
 */
export function decideInjection(
  element: SourceElement,
  catalog: SaltCatalog | undefined,
): InjectionDecision {
  // A source-authored HTML element is the case React documents: custom data-*
  // attributes on built-in browser elements reach the DOM unchanged.
  if (element.elementKind === 'host') return { inject: true }

  const pkg = element.library?.name ?? 'local'
  const component = element.library?.component ?? element.elementType
  const entry = lookupCatalog(catalog, pkg, component)
  if (mayInject(entry)) return { inject: true }
  return { inject: false, note: injectionNote(entry) }
}

/**
 * What a preview build adds, and what an author adds for a preview build. A
 * production artifact keeps neither: it should carry no trace that the loop
 * exists. The Vite adapter strips these in its babel pass; this is the same
 * removal for a build whose transform runs as a loader.
 */
const STRIPPED = new Set<string>([ATTR.sourceId, ATTR.explicitKey, ATTR.instanceKey])

export function stripProvenanceSource(code: string, file: string): InstrumentResult | null {
  if (![...STRIPPED].some((attribute) => code.includes(attribute))) return null
  const ast = parseSource(code, file)
  let removed = 0

  traverse(ast, {
    JSXOpeningElement(path) {
      const attributes = path.node.attributes
      for (let position = attributes.length - 1; position >= 0; position--) {
        const attribute = attributes[position]!
        if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) continue
        if (!STRIPPED.has(attribute.name.name)) continue
        attributes.splice(position, 1)
        removed++
      }
    },
  })

  if (removed === 0) return null
  const result = generate(
    ast,
    { sourceMaps: true, sourceFileName: file, retainLines: true },
    code,
  )
  return { code: result.code, map: result.map, injections: [] }
}

/**
 * Injects the source id into eligible elements and records why it did not for
 * the rest. It never wraps, never relies on display: contents, and never moves
 * a node: the rendered tree the reviewer sees must be the tree the application
 * would render without the instrumenter.
 */
export function instrumentSource(options: InstrumentOptions): InstrumentResult {
  const ast = parseSource(options.code, options.file)
  const injections: InjectionRecord[] = []
  let index = 0

  traverse(ast, {
    JSXElement: {
      enter(path) {
        const opening = path.node.openingElement
        if (!elementName(opening) || !opening.loc) return
        const current = index++
        const element = options.elements[current]
        const sourceId = options.ids.get(current)
        if (!element || !sourceId) return

        const { inject, note } = decideInjection(element, options.catalog)
        injections.push({ index: current, sourceId, instrumented: inject, note })
        if (!inject) return

        const already = opening.attributes.some(
          (attribute) =>
            t.isJSXAttribute(attribute) &&
            t.isJSXIdentifier(attribute.name) &&
            attribute.name.name === ATTR.sourceId,
        )
        if (already) return

        // Appended last so an author's own spread cannot overwrite it.
        opening.attributes.push(
          t.jsxAttribute(t.jsxIdentifier(ATTR.sourceId), t.stringLiteral(sourceId)),
        )
      },
    },
  })

  const result = generate(
    ast,
    {
      sourceMaps: options.sourceMaps ?? true,
      sourceFileName: options.file,
      retainLines: true,
    },
    options.code,
  )

  return { code: result.code, map: result.map, injections }
}
