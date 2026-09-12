import { readFileSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { ATTR } from '../core/attributes.js'
import type { Registry } from '../core/types.js'

/**
 * Source-time validation. These rules report; they never modify build output,
 * and they never write the registry. Their job is to tell a developer about an
 * ambiguity at the moment they create it, rather than when CI fails.
 */

interface Node {
  type: string
  name?: { type?: string; name?: string }
  attributes?: Node[]
  value?: { type?: string; value?: string }
  parent?: Node
  callee?: { type?: string; property?: { name?: string } }
  id?: { name?: string }
  loc?: unknown
}

interface RuleContext {
  report(descriptor: { node: Node; messageId: string; data?: Record<string, string> }): void
  filename?: string
  getFilename?(): string
  cwd?: string
  options?: unknown[]
}

type Rule = {
  meta: {
    type: 'problem' | 'suggestion'
    docs: { description: string }
    schema: unknown[]
    messages: Record<string, string>
  }
  create(context: RuleContext): Record<string, (node: Node) => void>
}

function attribute(node: Node, name: string): Node | undefined {
  return node.attributes?.find(
    (candidate) =>
      candidate.type === 'JSXAttribute' &&
      candidate.name?.type === 'JSXIdentifier' &&
      candidate.name.name === name,
  )
}

function literalValue(attr: Node | undefined): string | undefined {
  if (!attr?.value) return undefined
  if (attr.value.type === 'Literal' || attr.value.type === 'StringLiteral') {
    return typeof attr.value.value === 'string' ? attr.value.value : undefined
  }
  return undefined
}

function filenameOf(context: RuleContext): string {
  return context.filename ?? context.getFilename?.() ?? '<input>'
}

function enclosingComponent(node: Node): string {
  let current: Node | undefined = node.parent
  while (current) {
    if (current.type === 'FunctionDeclaration' && current.id?.name) return current.id.name
    if (
      (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') &&
      current.parent?.type === 'VariableDeclarator'
    ) {
      const name = (current.parent as Node & { id?: { name?: string } }).id?.name
      if (name) return name
    }
    current = current.parent
  }
  return '<module>'
}

const noDuplicateExplicitKey: Rule = {
  meta: {
    type: 'problem',
    docs: { description: 'explicit provenance keys must be unique within a component' },
    schema: [],
    messages: {
      duplicate:
        'UIP_DUPLICATE_EXPLICIT_KEY: "{{key}}" is already used in {{component}}. Give each element a distinct key.',
    },
  },
  create(context) {
    const seen = new Map<string, Node>()
    return {
      JSXOpeningElement(node) {
        const key = literalValue(attribute(node, ATTR.explicitKey))
        if (!key) return
        const scope = `${enclosingComponent(node)}::${key}`
        if (seen.has(scope)) {
          context.report({
            node,
            messageId: 'duplicate',
            data: { key, component: enclosingComponent(node) },
          })
          return
        }
        seen.set(scope, node)
      },
    }
  },
}

function insideMapCallback(node: Node): boolean {
  let current: Node | undefined = node.parent
  while (current) {
    if (
      (current.type === 'ArrowFunctionExpression' || current.type === 'FunctionExpression') &&
      current.parent?.type === 'CallExpression'
    ) {
      const callee = (current.parent as Node).callee
      if (callee?.type === 'MemberExpression' && callee.property?.name === 'map') return true
    }
    current = current.parent
  }
  return false
}

function hasInstanceKeyAbove(node: Node): boolean {
  let current: Node | undefined = node
  while (current) {
    if (current.type === 'JSXOpeningElement' && attribute(current, ATTR.instanceKey)) return true
    if (current.type === 'JSXElement') {
      const opening = (current as Node & { openingElement?: Node }).openingElement
      if (opening && attribute(opening, ATTR.instanceKey)) return true
    }
    current = current.parent
  }
  return false
}

const repeatedInstanceNeedsKey: Rule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'repeated renders need an instance key to be individually reviewable' },
    schema: [],
    messages: {
      missing:
        'UIP_INSTANCE_AMBIGUOUS: this element renders once per item and carries no {{attribute}}, so feedback on one of them cannot be told from the others.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (!insideMapCallback(node)) return
        if (hasInstanceKeyAbove(node)) return
        // Only the outermost element in the callback is worth reporting; a key
        // there covers everything beneath it.
        const parent = node.parent?.parent
        if (parent && parent.type === 'JSXElement' && insideMapCallback(parent)) return
        context.report({ node, messageId: 'missing', data: { attribute: ATTR.instanceKey } })
      },
    }
  },
}

const noGeneratedAttribute: Rule = {
  meta: {
    type: 'problem',
    docs: { description: 'the provenance id is generated, never authored' },
    schema: [],
    messages: {
      authored:
        '{{attribute}} is generated by the instrumenter. Use {{key}} to pin an identity instead.',
    },
  },
  create(context) {
    return {
      JSXOpeningElement(node) {
        if (!attribute(node, ATTR.sourceId)) return
        context.report({
          node,
          messageId: 'authored',
          data: { attribute: ATTR.sourceId, key: ATTR.explicitKey },
        })
      },
    }
  },
}

const registryCache = new Map<string, Registry | null>()

function findRegistry(from: string): { registry: Registry | null; root: string } {
  let directory = dirname(from)
  for (let depth = 0; depth < 12; depth++) {
    const path = join(directory, '.ui-provenance/registry.json')
    if (registryCache.has(path)) return { registry: registryCache.get(path)!, root: directory }
    try {
      const registry = JSON.parse(readFileSync(path, 'utf8')) as Registry
      registryCache.set(path, registry)
      return { registry, root: directory }
    } catch {
      registryCache.set(path, null)
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
  return { registry: null, root: dirname(from) }
}

const registryUpToDate: Rule = {
  meta: {
    type: 'problem',
    docs: { description: 'the committed registry must know every explicit key in the source' },
    schema: [],
    messages: {
      stale:
        'UIP_REGISTRY_OUT_OF_DATE: "{{key}}" is not in the committed registry. Run `ui-provenance sync` and commit the result.',
    },
  },
  create(context) {
    const filename = filenameOf(context)
    const { registry, root } = findRegistry(filename)
    if (!registry) return {} as Record<string, (node: Node) => void>
    const file = relative(root, filename).split(sep).join('/')

    return {
      JSXOpeningElement(node) {
        const key = literalValue(attribute(node, ATTR.explicitKey))
        if (!key) return
        const known = registry.entries.some(
          (entry) => entry.status === 'active' && entry.explicitKey === key && entry.file === file,
        )
        if (!known) context.report({ node, messageId: 'stale', data: { key } })
      },
    }
  },
}

export const rules = {
  'no-duplicate-explicit-key': noDuplicateExplicitKey,
  'repeated-instance-needs-key': repeatedInstanceNeedsKey,
  'no-generated-attribute': noGeneratedAttribute,
  'registry-up-to-date': registryUpToDate,
}

export const plugin = {
  meta: { name: '@de/ui-provenance', version: '0.2.0' },
  rules,
}

export const configs = {
  recommended: {
    plugins: { 'ui-provenance': plugin },
    rules: {
      'ui-provenance/no-duplicate-explicit-key': 'error',
      'ui-provenance/no-generated-attribute': 'error',
      'ui-provenance/registry-up-to-date': 'error',
      'ui-provenance/repeated-instance-needs-key': 'warn',
    },
  },
}

export default plugin
