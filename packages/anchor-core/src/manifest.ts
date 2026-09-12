import type { ProvenanceManifest, ProvenanceNodeEntry } from './types.js'
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

/** Read the raw instrumentation attribute off an element. */
export function provAttr(element: Element): string | null {
  return element.getAttribute(ATTR.prov)
}
