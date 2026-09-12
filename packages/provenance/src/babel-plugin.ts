import { ATTR } from '@adl/anchor-core'
import type { ManifestCollector } from './collector.js'

/**
 * Minimal structural types for the slice of the babel API this plugin uses.
 * Typing it locally keeps @babel/core a peer concern of the host build rather
 * than a dependency of this package.
 */
interface BabelNode {
  type: string
  [key: string]: unknown
}

interface BabelPath<N extends BabelNode = BabelNode> {
  node: N
  parent: BabelNode
  parentPath: BabelPath | null
}

export interface BabelTypes {
  jsxAttribute(name: unknown, value: unknown): BabelNode
  jsxIdentifier(name: string): BabelNode
  stringLiteral(value: string): BabelNode
}

interface PluginPass {
  filename?: string
  cwd?: string
  file?: { opts?: { filename?: string; root?: string; cwd?: string } }
}

export interface ProvenanceBabelOptions {
  collector: ManifestCollector
  /** Absolute path that recorded file paths are made relative to. */
  root?: string
  /** Skip instrumentation entirely, e.g. a production build with no preview. */
  enabled?: boolean
}

const SKIPPED_ELEMENTS = new Set(['fragment'])

function isComponentName(name: string): boolean {
  const first = name[0]
  return Boolean(first) && /[A-Z]/.test(first!)
}

function nameOfDeclarator(path: BabelPath): string | undefined {
  const parent = path.parent as { type: string; id?: { type: string; name?: string } }
  if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') return parent.id.name
  return undefined
}

/**
 * Nearest enclosing function or class with a component-shaped name. Walking up
 * matters: a JSX element returned from a `renderRow` helper still belongs to
 * the component that defines the helper, and that is the name a reviewer reads
 * in the semantic path.
 */
export function resolveComponentName(path: BabelPath): string {
  let current: BabelPath | null = path
  while (current) {
    const node = current.node as BabelNode & { id?: { name?: string } }
    let candidate: string | undefined
    switch (node.type) {
      case 'FunctionDeclaration':
      case 'ClassDeclaration':
      case 'ClassExpression':
        candidate = node.id?.name
        break
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        candidate = node.id?.name ?? nameOfDeclarator(current)
        break
      default:
        candidate = undefined
    }
    if (candidate && isComponentName(candidate)) return candidate
    current = current.parentPath
  }
  return 'Anonymous'
}

function relativise(filename: string, root: string | undefined): string {
  if (!root) return filename
  const normalizedRoot = root.endsWith('/') ? root : `${root}/`
  return filename.startsWith(normalizedRoot) ? filename.slice(normalizedRoot.length) : filename
}

/**
 * Emits `data-prov="<module>:<line>:<column>"` on every host element and records
 * the matching manifest entry. Only host elements are touched: an attribute on
 * a component is a prop, and props do not reliably reach the DOM.
 *
 * This is a platform contract change, additive in the same way the shell event
 * hub was. A participating MFE adds the plugin; nothing else about it changes.
 */
export function createBabelPlugin(options: ProvenanceBabelOptions) {
  const { collector } = options
  const enabled = options.enabled ?? true

  return function provenancePlugin(babel: { types: BabelTypes }) {
    const t = babel.types
    return {
      name: 'adl-provenance',
      visitor: {
        JSXOpeningElement(path: BabelPath, state: PluginPass) {
          if (!enabled) return
          const node = path.node as BabelNode & {
            name?: { type: string; name?: string }
            attributes?: BabelNode[]
            loc?: { start: { line: number; column: number } }
          }
          if (node.name?.type !== 'JSXIdentifier') return
          const element = node.name.name ?? ''
          if (!element || isComponentName(element) || SKIPPED_ELEMENTS.has(element.toLowerCase())) return
          if (!node.loc) return

          const attributes = node.attributes
          if (!attributes) return
          const already = attributes.some(
            (attr) =>
              attr.type === 'JSXAttribute' &&
              (attr as { name?: { name?: string } }).name?.name === ATTR.prov,
          )
          if (already) return

          const filename = state.filename ?? state.file?.opts?.filename
          if (!filename || filename.includes('node_modules')) return

          const file = relativise(filename, options.root ?? state.file?.opts?.root ?? state.cwd)
          const { token } = collector.record({
            file,
            component: resolveComponentName(path),
            element,
            line: node.loc.start.line,
            // Babel columns are 0-based; editors and stack traces are 1-based.
            column: node.loc.start.column + 1,
          })

          attributes.push(t.jsxAttribute(t.jsxIdentifier(ATTR.prov), t.stringLiteral(token)))
        },
      },
    }
  }
}
