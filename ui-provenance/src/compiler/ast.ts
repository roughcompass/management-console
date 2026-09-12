import { parse } from '@babel/parser'
import type { ParseResult } from '@babel/parser'
import _traverse from '@babel/traverse'
import type { NodePath } from '@babel/traverse'
import * as t from '@babel/types'
import { createHash } from 'node:crypto'
import { ATTR } from '../core/attributes.js'
import { fingerprintInput } from '../core/fingerprint.js'
import type { FingerprintInput } from '../core/fingerprint.js'
import type { ElementKind } from '../core/types.js'

// @babel/traverse ships CJS; the default export lands under .default under ESM.
const traverse = ((_traverse as unknown as { default?: typeof _traverse }).default ??
  _traverse) as typeof _traverse

/** Literal props that carry an accessible name, and are usually stable. */
const ACCESSIBLE_PROPS = new Set(['aria-label', 'aria-labelledby', 'alt', 'title', 'placeholder'])

export interface SourceElement {
  file: string
  line: number
  column: number
  elementType: string
  elementKind: ElementKind
  enclosingComponent: string
  explicitKey: string | null
  hasInstanceKey: boolean
  /** Index of the enclosing source element in the same file, if any. */
  parentIndex: number | null
  /**
   * Position among siblings of the same element type under the same parent.
   * Stable under edits that shift the whole file - wrapping a subtree, adding
   * an element above - which absolute position is not.
   */
  siblingOrder: number
  fingerprintParts: FingerprintInput
  fingerprint: string
  library?: { name: string; component: string }
}

export interface ParsedFile {
  file: string
  elements: SourceElement[]
}

export function parseSource(code: string, file: string): ParseResult<t.File> {
  return parse(code, {
    sourceType: 'module',
    sourceFilename: file,
    plugins: [
      'jsx',
      'typescript',
      'decorators-legacy',
      'classProperties',
      'topLevelAwait',
      'importAttributes',
    ],
  })
}

export function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`
}

function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name)
}

export function elementName(node: t.JSXOpeningElement): string | null {
  const name = node.name
  if (t.isJSXIdentifier(name)) return name.name
  // `<Salt.Button>`: the member expression is the name a reviewer reads.
  if (t.isJSXMemberExpression(name)) {
    const parts: string[] = []
    let current: t.JSXMemberExpression | t.JSXIdentifier = name
    while (t.isJSXMemberExpression(current)) {
      parts.unshift(t.isJSXIdentifier(current.property) ? current.property.name : '?')
      current = current.object
    }
    parts.unshift(t.isJSXIdentifier(current) ? current.name : '?')
    return parts.join('.')
  }
  return null
}

function literalAttribute(node: t.JSXOpeningElement, name: string): string | null {
  for (const attribute of node.attributes) {
    if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) continue
    if (attribute.name.name !== name) continue
    if (t.isStringLiteral(attribute.value)) return attribute.value.value
    if (
      t.isJSXExpressionContainer(attribute.value) &&
      t.isStringLiteral(attribute.value.expression)
    ) {
      return attribute.value.expression.value
    }
  }
  return null
}

function hasAttribute(node: t.JSXOpeningElement, name: string): boolean {
  return node.attributes.some(
    (attribute) =>
      t.isJSXAttribute(attribute) &&
      t.isJSXIdentifier(attribute.name) &&
      attribute.name.name === name,
  )
}

function propNamesOf(node: t.JSXOpeningElement): string[] {
  const names: string[] = []
  for (const attribute of node.attributes) {
    if (t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name)) {
      names.push(attribute.name.name)
    } else if (t.isJSXSpreadAttribute(attribute)) {
      // A spread's contents are unknowable at build time; record its presence
      // so an element that gains or loses one is not mistaken for another.
      names.push('...spread')
    }
  }
  return names
}

function literalTextOf(element: t.JSXElement): string[] {
  const out: string[] = []
  for (const child of element.children) {
    if (t.isJSXText(child) && child.value.trim()) out.push(child.value)
  }
  return out
}

function accessibleLabelsOf(node: t.JSXOpeningElement): string[] {
  const out: string[] = []
  for (const attribute of node.attributes) {
    if (!t.isJSXAttribute(attribute) || !t.isJSXIdentifier(attribute.name)) continue
    if (!ACCESSIBLE_PROPS.has(attribute.name.name)) continue
    const value = literalAttribute(node, attribute.name.name)
    if (value) out.push(`${attribute.name.name}=${value}`)
  }
  return out
}

/** Nearest enclosing function or class with a component-shaped name. */
export function enclosingComponentOf(path: NodePath): string {
  let current: NodePath | null = path
  while (current) {
    const node = current.node as t.Node & { id?: t.Identifier | null }
    let candidate: string | undefined
    if (t.isFunctionDeclaration(node) || t.isClassDeclaration(node) || t.isClassExpression(node)) {
      candidate = node.id?.name
    } else if (t.isArrowFunctionExpression(node) || t.isFunctionExpression(node)) {
      const parent = current.parent
      if (t.isVariableDeclarator(parent) && t.isIdentifier(parent.id)) candidate = parent.id.name
      else if (t.isFunctionExpression(node) && node.id) candidate = node.id.name
    }
    if (candidate && isComponentName(candidate)) return candidate
    current = current.parentPath
  }
  return 'Anonymous'
}

export interface ParseOptions {
  file: string
  /** Package names treated as the design system. */
  saltPackages: readonly string[]
}

/**
 * One pass per file, producing the source elements and their fingerprints.
 * Fingerprints are computed parent-first, because a parent's fingerprint is an
 * input to its children's: an element's identity includes where it sits.
 */
export function parseFileElements(code: string, options: ParseOptions): ParsedFile {
  const ast = parseSource(code, options.file)

  const saltImports = new Map<string, { name: string; component: string }>()
  traverse(ast, {
    ImportDeclaration(path) {
      const source = path.node.source.value
      if (!options.saltPackages.includes(source)) return
      for (const specifier of path.node.specifiers) {
        if (t.isImportSpecifier(specifier)) {
          const imported = t.isIdentifier(specifier.imported)
            ? specifier.imported.name
            : specifier.imported.value
          saltImports.set(specifier.local.name, { name: source, component: imported })
        } else if (t.isImportDefaultSpecifier(specifier)) {
          saltImports.set(specifier.local.name, { name: source, component: 'default' })
        }
      }
    },
  })

  const elements: SourceElement[] = []
  const indexByNode = new Map<t.Node, number>()
  const siblingCounts = new Map<string, number>()

  traverse(ast, {
    JSXElement: {
      enter(path) {
        const opening = path.node.openingElement
        const name = elementName(opening)
        if (!name || !opening.loc) return

        const root = name.split('.')[0]!
        const salt = saltImports.get(root)
        const kind: ElementKind = salt ? 'salt' : isComponentName(root) ? 'application' : 'host'

        // The nearest enclosing JSX element in this file, which is what the
        // parent fingerprint and parentSourceId refer to.
        let parentIndex: number | null = null
        let parentPath: NodePath | null = path.parentPath
        while (parentPath) {
          const parentNode = parentPath.node
          if (t.isJSXElement(parentNode) && indexByNode.has(parentNode)) {
            parentIndex = indexByNode.get(parentNode)!
            break
          }
          parentPath = parentPath.parentPath
        }

        const siblings: string[] = []
        const container = path.parent
        if (t.isJSXElement(container)) {
          for (const child of container.children) {
            if (t.isJSXElement(child)) {
              const childName = elementName(child.openingElement)
              if (childName) siblings.push(childName)
            }
          }
        }

        const parts: FingerprintInput = {
          elementType: name,
          propNames: propNamesOf(opening),
          accessibleLabels: accessibleLabelsOf(opening),
          literalText: literalTextOf(path.node),
          parentFingerprint: parentIndex === null ? null : elements[parentIndex]!.fingerprint,
          neighborShapes: siblings,
        }

        const siblingKey = `${parentIndex ?? 'root'}::${name}`
        const siblingOrder = siblingCounts.get(siblingKey) ?? 0
        siblingCounts.set(siblingKey, siblingOrder + 1)

        const element: SourceElement = {
          file: options.file,
          line: opening.loc.start.line,
          column: opening.loc.start.column + 1,
          elementType: name,
          elementKind: kind,
          enclosingComponent: enclosingComponentOf(path),
          explicitKey: literalAttribute(opening, ATTR.explicitKey),
          hasInstanceKey: hasAttribute(opening, ATTR.instanceKey),
          parentIndex,
          siblingOrder,
          fingerprintParts: parts,
          fingerprint: sha256(fingerprintInput(parts)),
          library: salt ? { name: salt.name, component: salt.component } : undefined,
        }

        indexByNode.set(path.node, elements.length)
        elements.push(element)
      },
    },
  })

  return { file: options.file, elements }
}

export function humanNameOf(element: SourceElement): string {
  return `${element.enclosingComponent}.${element.elementType}`
}
