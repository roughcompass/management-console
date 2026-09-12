import type { ProvenanceManifest, ProvenanceNodeEntry, ProvenanceScopeEntry } from './types.js'
import { ATTR } from './types.js'

export interface ProvToken {
  module: string
  line: number
  column: number
  raw: string
}

/** "a1b2c3d4:42:8" -> module a1b2c3d4, line 42, column 8. */
export function parseProvToken(raw: string | null | undefined): ProvToken | undefined {
  if (!raw) return undefined
  const parts = raw.split(':')
  if (parts.length !== 3) return undefined
  const [module, line, column] = parts
  const lineNum = Number(line)
  const colNum = Number(column)
  if (!module || !Number.isFinite(lineNum) || !Number.isFinite(colNum)) return undefined
  return { module, line: lineNum, column: colNum, raw }
}

export function formatProvToken(module: string, line: number, column: number): string {
  return `${module}:${line}:${column}`
}

export function lookupNode(
  manifest: ProvenanceManifest | undefined,
  raw: string,
): ProvenanceNodeEntry | undefined {
  return manifest?.nodes[raw]
}

export function lookupFile(
  manifest: ProvenanceManifest | undefined,
  moduleId: string,
): string | undefined {
  return manifest?.modules[moduleId]?.file
}

export function lookupScope(
  manifest: ProvenanceManifest | undefined,
  moduleId: string,
): { name: string; entry: ProvenanceScopeEntry } | undefined {
  const name = manifest?.modules[moduleId]?.scope
  const entry = name ? manifest?.scopes[name] : undefined
  return name && entry ? { name, entry } : undefined
}

/**
 * A federated page carries one manifest per remote. Module ids are hashed with
 * their scope, so two remotes that both ship a `src/App.tsx` do not collide and
 * the union is safe to take.
 */
export function mergeProvenanceManifests(
  ...manifests: Array<ProvenanceManifest | undefined>
): ProvenanceManifest {
  const merged: ProvenanceManifest = { version: 1, scopes: {}, modules: {}, nodes: {} }
  for (const manifest of manifests) {
    if (!manifest) continue
    Object.assign(merged.scopes, manifest.scopes)
    Object.assign(merged.modules, manifest.modules)
    Object.assign(merged.nodes, manifest.nodes)
  }
  return merged
}

const GLOBAL_KEY = '__ADL_PROVENANCE__'

type ManifestHost = Record<string, unknown>

/**
 * The manifest is published by the build alongside the preview. Keeping it out
 * of the DOM keeps the instrumentation attribute to a dozen bytes per node.
 */
export function setProvenanceManifest(
  manifest: ProvenanceManifest,
  host: ManifestHost = globalThis as unknown as ManifestHost,
): void {
  host[GLOBAL_KEY] = manifest
}

export function getProvenanceManifest(
  host: ManifestHost = globalThis as unknown as ManifestHost,
): ProvenanceManifest | undefined {
  return host[GLOBAL_KEY] as ProvenanceManifest | undefined
}

export async function loadProvenanceManifest(url: string): Promise<ProvenanceManifest> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`provenance manifest ${url} -> ${res.status}`)
  const manifest = (await res.json()) as ProvenanceManifest
  setProvenanceManifest(manifest)
  return manifest
}

/**
 * Load every participant's manifest and merge. A remote that is unreachable is
 * skipped rather than failing the preview: its nodes simply anchor one level
 * further down the chain.
 */
export async function loadProvenanceManifests(
  urls: readonly string[],
): Promise<ProvenanceManifest> {
  const loaded = await Promise.all(
    urls.map(async (url) => {
      try {
        const res = await fetch(url)
        if (!res.ok) return undefined
        return (await res.json()) as ProvenanceManifest
      } catch {
        return undefined
      }
    }),
  )
  const merged = mergeProvenanceManifests(...loaded)
  setProvenanceManifest(merged)
  return merged
}

/** Read the raw instrumentation attribute off an element. */
export function provAttr(element: Element): string | null {
  return element.getAttribute(ATTR.prov)
}

// --------------------------------------------------------------------------
// Adapter for @de/ui-provenance manifests
// --------------------------------------------------------------------------

interface UiProvenanceSource {
  sourceId: string
  file: string
  line?: number
  column?: number
  enclosingComponent: string
  elementType: string
  library?: { name: string; version: string; component: string }
}

export interface UiProvenanceManifest {
  schemaVersion: string
  applicationId: string
  repository: string
  commitSha: string
  buildId: string
  sources: Record<string, UiProvenanceSource>
}

/**
 * Turns an instrumenter manifest into the shape the anchor index reads.
 *
 * The instrumenter owns identity: its source ids come from a source-controlled
 * registry and survive ordinary edits, which is what the provenance level of
 * the chain always wanted and could not produce from a line number.
 */
export function adaptUiProvenanceManifest(manifest: UiProvenanceManifest): ProvenanceManifest {
  const scope = manifest.applicationId
  const adapted: ProvenanceManifest = {
    version: 1,
    scopes: {
      [scope]: { repo: manifest.repository, commit: manifest.commitSha, buildId: manifest.buildId },
    },
    modules: {},
    nodes: {},
  }

  for (const entry of Object.values(manifest.sources)) {
    const moduleId = `${scope}:${entry.file}`
    adapted.modules[moduleId] = { file: entry.file, scope }
    adapted.nodes[entry.sourceId] = {
      module: moduleId,
      component: entry.enclosingComponent,
      element: entry.elementType,
      line: entry.line ?? 0,
      column: entry.column ?? 0,
    }
  }

  return adapted
}
